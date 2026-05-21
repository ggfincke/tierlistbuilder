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
import { mediaVariantKindValidator } from '../../lib/validators/platform'
import type { MediaVariantKind } from '@tierlistbuilder/contracts/platform/media'
import type { Doc, Id } from '../../_generated/dataModel'
import type { QueryCtx } from '../../_generated/server'
import { selectMediaVariantSummary } from '../../lib/mediaVariants'
import { BOARD_ITEM_TAKE_LIMIT } from '../../lib/limits'
import { loadBoundedBoardRows } from '../../workspace/sync/loadBoundedBoardRows'
import { memoizePromise } from '../../lib/cache'

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
// most assets resolve in one page, small enough that one degenerate scan can't
// consume the entire per-query budget before we move on to the next asset
const MEDIA_REF_PAGE_SIZE = 128
// per-call total read budget shared across every reachability check in one
// query invocation. caps the worst-case read cost of a batched lookup so a
// single hot asset can't push the whole query past Convex's transaction ceiling
const MEDIA_REF_CALL_BUDGET = 4096

interface ReachabilityBudget
{
  remaining: number
}

const reserveBudget = (
  budget: ReachabilityBudget,
  requested: number
): number =>
{
  const reserved = Math.min(requested, budget.remaining)
  budget.remaining -= reserved
  return reserved
}

const refundUnusedBudget = (
  budget: ReachabilityBudget,
  reserved: number,
  used: number
): void =>
{
  budget.remaining += Math.max(0, reserved - used)
}

const isMediaReferencedByUserBoard = async (
  ctx: QueryCtx,
  assetId: Id<'mediaAssets'>,
  userId: Id<'users'>,
  budget: ReachabilityBudget
): Promise<boolean> =>
{
  let cursor: string | null = null

  while (budget.remaining > 0)
  {
    const pageBudget = reserveBudget(budget, MEDIA_REF_PAGE_SIZE)
    if (pageBudget === 0) return false
    const page = await ctx.db
      .query('boardItems')
      .withIndex('byMedia', (q) => q.eq('mediaAssetId', assetId))
      .paginate({
        cursor,
        numItems: pageBudget,
      })
    refundUnusedBudget(budget, pageBudget, page.page.length)

    const boardIds = [...new Set(page.page.map((item) => item.boardId))]
    const boardBudget = reserveBudget(budget, boardIds.length)
    const boards = await Promise.all(
      boardIds.slice(0, boardBudget).map((boardId) => ctx.db.get(boardId))
    )
    if (boards.some((board) => board?.ownerId === userId))
    {
      return true
    }
    if (boardBudget < boardIds.length) return false
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
  assetId: Id<'mediaAssets'>,
  budget: ReachabilityBudget
): Promise<boolean> =>
{
  let itemCursor: string | null = null
  while (budget.remaining > 0)
  {
    const pageBudget = reserveBudget(budget, MEDIA_REF_PAGE_SIZE)
    if (pageBudget === 0) return false
    const page = await ctx.db
      .query('templateItems')
      .withIndex('byMedia', (q) => q.eq('mediaAssetId', assetId))
      .paginate({
        cursor: itemCursor,
        numItems: pageBudget,
      })
    refundUnusedBudget(budget, pageBudget, page.page.length)

    const templateIds = [...new Set(page.page.map((item) => item.templateId))]
    const templateBudget = reserveBudget(budget, templateIds.length)
    const templates = await Promise.all(
      templateIds
        .slice(0, templateBudget)
        .map((templateId) => ctx.db.get(templateId))
    )
    if (
      templates.some(
        (template) => template && template.publicationState === 'published'
      )
    )
    {
      return true
    }
    if (templateBudget < templateIds.length) return false
    if (page.isDone)
    {
      break
    }
    itemCursor = page.continueCursor
  }

  let coverCursor: string | null = null
  while (budget.remaining > 0)
  {
    const pageBudget = reserveBudget(budget, MEDIA_REF_PAGE_SIZE)
    if (pageBudget === 0) return false
    const page = await ctx.db
      .query('templates')
      .withIndex('byCoverMedia', (q) => q.eq('coverMediaAssetId', assetId))
      .paginate({
        cursor: coverCursor,
        numItems: pageBudget,
      })
    refundUnusedBudget(budget, pageBudget, page.page.length)

    if (
      page.page.some((template) => template.publicationState === 'published')
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

// returns true when the requesting user is allowed to read this asset.
// "false" is the safe fallback — a budget-exhausted scan returns not-readable
// rather than guessing, so the client just sees a null URL for that asset
const canReadMediaAsset = async (
  ctx: QueryCtx,
  asset: Doc<'mediaAssets'>,
  userId: Id<'users'>,
  budget: ReachabilityBudget
): Promise<boolean> =>
{
  if (asset.ownerId === userId) return true
  if (await isMediaReferencedByTemplate(ctx, asset._id, budget)) return true
  return await isMediaReferencedByUserBoard(ctx, asset._id, userId, budget)
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

    const uniqueExternalIds = [
      ...new Set(args.media.map((req) => req.externalId)),
    ]
    const loadedAssets = await Promise.all(
      uniqueExternalIds.map(async (externalId) => ({
        externalId,
        asset: await findMediaAssetByExternalId(ctx, externalId),
      }))
    )
    const budget: ReachabilityBudget = { remaining: MEDIA_REF_CALL_BUDGET }

    // requests for the same asset under different variants share the
    // asset+permission lookup, & every reachability scan draws from one cap.
    const readableAssets = new Map<string, Doc<'mediaAssets'> | null>()
    for (const { externalId, asset } of loadedAssets)
    {
      if (!asset)
      {
        readableAssets.set(externalId, null)
        continue
      }
      readableAssets.set(
        externalId,
        (await canReadMediaAsset(ctx, asset, userId, budget)) ? asset : null
      )
    }

    // same-storageId URL requests share the getUrl call
    const urlCache = new Map<Id<'_storage'>, Promise<string | null>>()

    const loadStorageUrl = (
      storageId: Id<'_storage'>
    ): Promise<string | null> =>
      memoizePromise(urlCache, storageId, () => ctx.storage.getUrl(storageId))

    const load = async (
      request: MediaAssetLookupRequest
    ): Promise<MediaAssetLookup | null> =>
    {
      const asset = readableAssets.get(request.externalId) ?? null
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
