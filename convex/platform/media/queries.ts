// convex/platform/media/queries.ts
// media asset queries — resolve externalIds to signed download URLs

import { ConvexError, v } from 'convex/values'
import { query } from '../../_generated/server'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { requireCurrentUserId } from '../../lib/auth'
import {
  findMediaAssetByExternalId,
  findOwnedBoardByExternalIdIncludingDeleted,
} from '../../lib/permissions'
import { mediaVariantKindValidator } from '../../lib/validators'
import type { MediaVariantKind } from '@tierlistbuilder/contracts/platform/media'
import type { Doc, Id } from '../../_generated/dataModel'
import type { QueryCtx } from '../../_generated/server'
import { selectMediaVariantSummary } from '../../lib/mediaVariants'
import { BOARD_ITEM_TAKE_LIMIT } from '../../lib/limits'
import { loadBoundedBoardRows } from '../../workspace/sync/loadBoundedBoardRows'

// hard cap per batch — protects the query's document read budget. clients
// chunk their pending batches to fit. 50 covers the common "warm a board"
// burst w/ headroom against Convex's 4096-read per-query limit
const MAX_BATCH_LOOKUP_SIZE = 50

interface MediaAssetLookup
{
  externalId: string
  url: string
  mimeType: string
}

interface MediaAssetLookupRequest
{
  externalId: string
  variant: MediaVariantKind
}

const mediaAssetLookupRequestValidator = v.object({
  externalId: v.string(),
  variant: mediaVariantKindValidator,
})

// return validator for the batch lookup — mirrors MediaAssetLookup
const mediaAssetLookupValidator = v.object({
  externalId: v.string(),
  url: v.string(),
  mimeType: v.string(),
})

const loadReusableBoardMediaAssetIds = async (
  ctx: QueryCtx,
  userId: Id<'users'>,
  boardExternalId: string | null
): Promise<Set<Id<'mediaAssets'>>> =>
{
  if (!boardExternalId) return new Set()

  const board = await findOwnedBoardByExternalIdIncludingDeleted(
    ctx,
    boardExternalId,
    userId
  )
  if (!board) return new Set()

  const { serverItems } = await loadBoundedBoardRows(ctx, board._id)
  return new Set(
    serverItems
      .map((item) => item.mediaAssetId)
      .filter((id): id is Id<'mediaAssets'> => id !== null)
  )
}

export const getReusableMediaExternalIds = query({
  args: {
    externalIds: v.array(v.string()),
    boardExternalId: v.union(v.string(), v.null()),
  },
  returns: v.array(v.boolean()),
  handler: async (ctx, args): Promise<boolean[]> =>
  {
    if (args.externalIds.length === 0)
    {
      return []
    }

    if (args.externalIds.length > BOARD_ITEM_TAKE_LIMIT)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidInput,
        message: `media reuse check exceeds cap of ${BOARD_ITEM_TAKE_LIMIT}`,
      })
    }

    const userId = await requireCurrentUserId(ctx)
    const reusableBoardMediaAssetIds = await loadReusableBoardMediaAssetIds(
      ctx,
      userId,
      args.boardExternalId
    )

    return await Promise.all(
      args.externalIds.map(async (externalId) =>
      {
        const asset = await findMediaAssetByExternalId(ctx, externalId)
        return (
          !!asset &&
          (asset.ownerId === userId ||
            reusableBoardMediaAssetIds.has(asset._id))
        )
      })
    )
  },
})

// page size for the paginated reachability scans below — large enough that
// most assets resolve in one page, small enough that a worst-case scan stays
// well under MEDIA_REF_SCAN_CAP * 1 round trips
const MEDIA_REF_PAGE_SIZE = 128
// hard cap on how many reference rows a single permission check will scan.
// limits a degenerate asset (e.g. one referenced across thousands of templates)
// from blowing the per-query read budget. matches the Convex 4096-read ceiling
const MEDIA_REF_SCAN_CAP = 4096

const isMediaReferencedByUserBoard = async (
  ctx: QueryCtx,
  assetId: Id<'mediaAssets'>,
  userId: Id<'users'>
): Promise<boolean> =>
{
  let cursor: string | null = null
  let scanned = 0

  while (scanned < MEDIA_REF_SCAN_CAP)
  {
    const page = await ctx.db
      .query('boardItems')
      .withIndex('byMedia', (q) => q.eq('mediaAssetId', assetId))
      .paginate({ cursor, numItems: MEDIA_REF_PAGE_SIZE })
    scanned += page.page.length

    const boardIds = [...new Set(page.page.map((item) => item.boardId))]
    const boards = await Promise.all(
      boardIds.map((boardId) => ctx.db.get(boardId))
    )
    if (boards.some((board) => board?.ownerId === userId))
    {
      return true
    }
    if (page.isDone)
    {
      return false
    }
    cursor = page.continueCursor
  }

  return false
}

const isMediaReferencedByTemplate = async (
  ctx: QueryCtx,
  assetId: Id<'mediaAssets'>
): Promise<boolean> =>
{
  let itemCursor: string | null = null
  let scannedItems = 0
  while (scannedItems < MEDIA_REF_SCAN_CAP)
  {
    const page = await ctx.db
      .query('templateItems')
      .withIndex('byMedia', (q) => q.eq('mediaAssetId', assetId))
      .paginate({ cursor: itemCursor, numItems: MEDIA_REF_PAGE_SIZE })
    scannedItems += page.page.length

    const templateIds = [...new Set(page.page.map((item) => item.templateId))]
    const templates = await Promise.all(
      templateIds.map((templateId) => ctx.db.get(templateId))
    )
    if (
      templates.some(
        (template) => template && template.publicationState !== 'unpublished'
      )
    )
    {
      return true
    }
    if (page.isDone)
    {
      break
    }
    itemCursor = page.continueCursor
  }

  let coverCursor: string | null = null
  let scannedCovers = 0
  while (scannedCovers < MEDIA_REF_SCAN_CAP)
  {
    const page = await ctx.db
      .query('templates')
      .withIndex('byCoverMedia', (q) => q.eq('coverMediaAssetId', assetId))
      .paginate({ cursor: coverCursor, numItems: MEDIA_REF_PAGE_SIZE })
    scannedCovers += page.page.length

    if (
      page.page.some((template) => template.publicationState !== 'unpublished')
    )
    {
      return true
    }
    if (page.isDone)
    {
      return false
    }
    coverCursor = page.continueCursor
  }

  return false
}

const canReadMediaAsset = async (
  ctx: QueryCtx,
  asset: Doc<'mediaAssets'>,
  userId: Id<'users'>
): Promise<boolean> =>
{
  if (asset.ownerId === userId) return true
  if (await isMediaReferencedByTemplate(ctx, asset._id)) return true
  return await isMediaReferencedByUserBoard(ctx, asset._id, userId)
}

// resolve a batch of media externalIds to signed download URLs. preserve input
// order so the client can pair results by index, & collapse a board's cloud
// image warm-up to one Convex call instead of N
export const getMediaAssetsByExternalIds = query({
  args: { media: v.array(mediaAssetLookupRequestValidator) },
  returns: v.array(v.union(mediaAssetLookupValidator, v.null())),
  handler: async (ctx, args): Promise<Array<MediaAssetLookup | null>> =>
  {
    if (args.media.length === 0)
    {
      return []
    }

    if (args.media.length > MAX_BATCH_LOOKUP_SIZE)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidInput,
        message: `batch lookup exceeds cap of ${MAX_BATCH_LOOKUP_SIZE}`,
      })
    }

    const userId = await requireCurrentUserId(ctx)

    // two-layer cache: requests for the same asset under different variants
    // share the asset+permission lookup (the expensive part — paginated
    // reachability scans), & same-storageId URL requests share the getUrl
    const assetCache = new Map<string, Promise<Doc<'mediaAssets'> | null>>()
    const urlCache = new Map<Id<'_storage'>, Promise<string | null>>()

    const loadReadableAsset = (
      externalId: string
    ): Promise<Doc<'mediaAssets'> | null> =>
    {
      const cached = assetCache.get(externalId)
      if (cached) return cached
      const pending = (async () =>
      {
        const asset = await findMediaAssetByExternalId(ctx, externalId)
        if (!asset) return null
        if (!(await canReadMediaAsset(ctx, asset, userId))) return null
        return asset
      })()
      assetCache.set(externalId, pending)
      return pending
    }

    const loadStorageUrl = (
      storageId: Id<'_storage'>
    ): Promise<string | null> =>
    {
      const cached = urlCache.get(storageId)
      if (cached) return cached
      const pending = ctx.storage.getUrl(storageId)
      urlCache.set(storageId, pending)
      return pending
    }

    const load = async (
      request: MediaAssetLookupRequest
    ): Promise<MediaAssetLookup | null> =>
    {
      const asset = await loadReadableAsset(request.externalId)
      if (!asset) return null

      const variant = selectMediaVariantSummary(asset, request.variant)
      if (!variant) return null

      const url = await loadStorageUrl(variant.storageId)
      if (!url) return null

      return {
        externalId: request.externalId,
        url,
        mimeType: variant.mimeType,
      }
    }

    return await Promise.all(args.media.map(load))
  },
})
