// convex/workspace/boards/queries.ts
// board queries — list & lookup for the authenticated caller

import { ConvexError, v } from 'convex/values'
import { query, type QueryCtx } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import {
  deriveLibraryPublishState,
  deriveLibrarySyncState,
  pickCoverRenderFields,
  type BoardListItem,
  type DeletedBoardListItem,
  type LibraryBoardCoverItem,
  type LibraryBoardListItem,
} from '@tierlistbuilder/contracts/workspace/board'
import type { TemplateCategory } from '@tierlistbuilder/contracts/marketplace/category'
import type {
  TemplateCoverFraming,
  TemplateMediaRef,
} from '@tierlistbuilder/contracts/marketplace/template'
import type { PaletteId } from '@tierlistbuilder/contracts/lib/theme'
import type { CloudBoardState } from '@tierlistbuilder/contracts/workspace/cloudBoard'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { getCurrentUserId, requireCurrentUserId } from '../../lib/auth'
import { findOwnedActiveBoardByExternalId } from '../../lib/permissions'
import {
  boardListItemValidator,
  cloudBoardStateValidator,
  deletedBoardListItemValidator,
  libraryBoardListItemValidator,
} from '../../lib/validators/workspace'
import { createTemplateProjectionCache } from '../../marketplace/templates/lib/trending'
import { toTemplateMediaRefWithFallback } from '../../marketplace/templates/lib/projections'
import {
  isPublishedTemplateRow,
  isPublicTemplateRow,
} from '../../marketplace/templates/lib/state'
import { isPublicRankingRow } from '../../marketplace/rankings/lib'
import { memoizePromise } from '../../lib/cache'
import { getBoardSourceTemplateId } from './sourceFields'
import { loadBoardCloudState } from '../sync/boardStateLoader'
import { loadBoundedBoardRows } from '../sync/loadBoundedBoardRows'

const MAX_BOARDS_PER_USER = 200
const MAX_DELETED_BOARDS_PER_USER = 200
// A single board pull can read thousands of item/tier/reference rows, so keep
// the public batch at one board per query & let the client parallelize calls.
const MAX_BOARD_STATE_BATCH = 1
const DEFAULT_LIBRARY_PALETTE_ID: PaletteId = 'classic'
const DEFAULT_LIBRARY_CATEGORY: TemplateCategory = 'other'

const toBoardListItem = (board: Doc<'boards'>): BoardListItem => ({
  externalId: board.externalId,
  title: board.title,
  createdAt: board.createdAt,
  updatedAt: board.updatedAt,
  revision: board.revision,
})

// asserts the row's deletedAt is non-null & narrows the type for callers.
// throws if the row was somehow returned by a deleted-board query w/o a
// stamp — guards against an index/filter mismatch across schema changes
const toDeletedBoardListItem = (board: Doc<'boards'>): DeletedBoardListItem =>
{
  if (board.deletedAt === null)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: `expected deletedAt on board ${board.externalId} but found null`,
    })
  }
  return {
    ...toBoardListItem(board),
    deletedAt: board.deletedAt,
  }
}

const loadOwnedBoardState = async (
  ctx: QueryCtx,
  userId: Id<'users'>,
  externalId: string
): Promise<CloudBoardState | null> =>
{
  const board = await findOwnedActiveBoardByExternalId(ctx, externalId, userId)
  if (!board || board.materializationState !== 'ready')
  {
    return null
  }

  const { serverTiers, serverItems } = await loadBoundedBoardRows(
    ctx,
    board._id
  )

  return loadBoardCloudState(ctx, board, serverTiers, serverItems)
}

// list non-deleted boards, newest updated first. byOwnerDeletedUpdatedAt has
// updatedAt trailing so order('desc') avoids a full-table scan + in-memory sort
export const getMyBoards = query({
  args: {},
  returns: v.array(boardListItemValidator),
  handler: async (ctx): Promise<BoardListItem[]> =>
  {
    const userId = await getCurrentUserId(ctx)
    if (!userId)
    {
      return []
    }

    const rows = await ctx.db
      .query('boards')
      .withIndex('byOwnerDeletedUpdatedAt', (q) =>
        q.eq('ownerId', userId).eq('deletedAt', null)
      )
      .order('desc')
      .take(MAX_BOARDS_PER_USER)

    return rows.map(toBoardListItem)
  },
})

// fetch the full server-side state for an owned board — used by the cloud-pull path
// on first sign-in & conflict resolution. returns the same shape as upsertBoardState's conflict response
export const getBoardStateByExternalId = query({
  args: { boardExternalId: v.string() },
  returns: v.union(cloudBoardStateValidator, v.null()),
  handler: async (ctx, args): Promise<CloudBoardState | null> =>
  {
    const userId = await getCurrentUserId(ctx)
    if (!userId)
    {
      return null
    }

    return await loadOwnedBoardState(ctx, userId, args.boardExternalId)
  },
})

// list soft-deleted boards, newest deletion first. rows past BOARD_TOMBSTONE_RETENTION_MS
// are hard-deleted by the daily cron, so this list shrinks naturally over time
export const getMyDeletedBoards = query({
  args: {},
  returns: v.array(deletedBoardListItemValidator),
  handler: async (ctx): Promise<DeletedBoardListItem[]> =>
  {
    const userId = await getCurrentUserId(ctx)
    if (!userId)
    {
      return []
    }

    // gt(0) skips the null gap & deletedAt===0 (never set). order('desc') sorts
    // deletedAt DESC w/ updatedAt DESC as tiebreaker
    const rows = await ctx.db
      .query('boards')
      .withIndex('byOwnerDeletedUpdatedAt', (q) =>
        q.eq('ownerId', userId).gt('deletedAt', 0)
      )
      .order('desc')
      .take(MAX_DELETED_BOARDS_PER_USER)

    return rows.map(toDeletedBoardListItem)
  },
})

export const getBoardStatesByExternalIds = query({
  args: { boardExternalIds: v.array(v.string()) },
  returns: v.array(v.union(cloudBoardStateValidator, v.null())),
  handler: async (ctx, args): Promise<Array<CloudBoardState | null>> =>
  {
    const userId = await requireCurrentUserId(ctx)

    if (args.boardExternalIds.length > MAX_BOARD_STATE_BATCH)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidInput,
        message: `too many boardExternalIds: ${args.boardExternalIds.length} exceeds ${MAX_BOARD_STATE_BATCH}`,
      })
    }

    return Promise.all(
      args.boardExternalIds.map((boardExternalId) =>
        loadOwnedBoardState(ctx, userId, boardExternalId)
      )
    )
  },
})

// enriched my-lists row — adds counts, denormalized cover/tier data,
// source-template category, & derived status/visibility onto each board
export const getMyLibraryBoards = query({
  args: {},
  returns: v.array(libraryBoardListItemValidator),
  handler: async (ctx): Promise<LibraryBoardListItem[]> =>
  {
    const userId = await getCurrentUserId(ctx)
    if (!userId)
    {
      return []
    }

    // user default palette — board.paletteId overrides this; both fall back to
    // the contract default ('classic') when neither is set
    const preferencesRow = await ctx.db
      .query('userPreferences')
      .withIndex('byUser', (q) => q.eq('userId', userId))
      .unique()
    const userDefaultPaletteId: PaletteId =
      preferencesRow?.preferences.paletteId ?? DEFAULT_LIBRARY_PALETTE_ID

    // active boards, newest updated first — same shape as getMyBoards
    const boards = await ctx.db
      .query('boards')
      .withIndex('byOwnerDeletedUpdatedAt', (q) =>
        q.eq('ownerId', userId).eq('deletedAt', null)
      )
      .order('desc')
      .take(MAX_BOARDS_PER_USER)

    if (boards.length === 0)
    {
      return []
    }

    const storageUrlCache = new Map<Id<'_storage'>, Promise<string | null>>()
    const loadStorageUrl = (
      storageId: Id<'_storage'>
    ): Promise<string | null> =>
      memoizePromise(storageUrlCache, storageId, () =>
        ctx.storage.getUrl(storageId)
      )

    const [sourceTemplateCovers, livePublicRankingIds, livePublicTemplateIds] =
      await Promise.all([
        loadSourceTemplateCovers(ctx, boards),
        loadReachableLivePublicRankingIds(ctx, boards),
        loadReachableLivePublicTemplateIds(ctx, boards),
      ])

    return Promise.all(
      boards.map((board) =>
      {
        const sourceTemplateId = getBoardSourceTemplateId(board)
        return projectLibraryRow(board, {
          userDefaultPaletteId,
          loadStorageUrl,
          sourceCover:
            sourceTemplateId !== null
              ? (sourceTemplateCovers.get(sourceTemplateId) ??
                EMPTY_SOURCE_TEMPLATE_COVER)
              : EMPTY_SOURCE_TEMPLATE_COVER,
          hasLivePublicRanking:
            board.livePublicRankingId != null &&
            livePublicRankingIds.has(board.livePublicRankingId),
          hasLiveTemplate:
            board.livePublicTemplateId != null &&
            livePublicTemplateIds.has(board.livePublicTemplateId),
        })
      })
    )
  },
})

interface SourceTemplateCover
{
  media: TemplateMediaRef | null
  framing: TemplateCoverFraming | null
}

const EMPTY_SOURCE_TEMPLATE_COVER: SourceTemplateCover = {
  media: null,
  framing: null,
}

interface LibraryRowContext
{
  userDefaultPaletteId: PaletteId
  loadStorageUrl: (storageId: Id<'_storage'>) => Promise<string | null>
  sourceCover: SourceTemplateCover
  hasLivePublicRanking: boolean
  hasLiveTemplate: boolean
}

const loadSourceTemplateCovers = async (
  ctx: QueryCtx,
  boards: readonly Doc<'boards'>[]
): Promise<Map<Id<'templates'>, SourceTemplateCover>> =>
{
  const templateIds = Array.from(
    new Set(
      boards.flatMap((board) =>
      {
        const sourceTemplateId = getBoardSourceTemplateId(board)
        return sourceTemplateId !== null ? [sourceTemplateId] : []
      })
    )
  )

  const cache = createTemplateProjectionCache()
  const entries = await Promise.all(
    templateIds.map(async (templateId) =>
    {
      const template = await ctx.db.get(templateId)
      if (!template)
      {
        return [templateId, EMPTY_SOURCE_TEMPLATE_COVER] as const
      }

      const media = await toTemplateMediaRefWithFallback(
        ctx,
        template.coverMediaAssetId,
        ['preview', 'tile'],
        cache
      )

      return [
        templateId,
        {
          media,
          framing: media ? (template.coverFraming ?? null) : null,
        },
      ] as const
    })
  )

  return new Map(entries)
}

const loadReachableLivePublicRankingIds = async (
  ctx: QueryCtx,
  boards: readonly Doc<'boards'>[]
): Promise<ReadonlySet<Id<'publishedRankings'>>> =>
{
  const rankingIds = Array.from(
    new Set(
      boards.flatMap((board) =>
        board.livePublicRankingId != null ? [board.livePublicRankingId] : []
      )
    )
  )
  if (rankingIds.length === 0) return new Set()

  const rankings = await Promise.all(rankingIds.map((id) => ctx.db.get(id)))
  const templateIds = Array.from(
    new Set(
      rankings.flatMap((ranking) =>
        ranking && isPublicRankingRow(ranking) ? [ranking.sourceTemplateId] : []
      )
    )
  )
  const templateRows = await Promise.all(
    templateIds.map((id) => ctx.db.get(id))
  )
  // template must be published & publicly listable; unlisted templates
  // shouldn't surface ranker boards as 'live' since the source is no longer
  // discoverable
  const reachableTemplateIds = new Set<Id<'templates'>>()
  for (const template of templateRows)
  {
    if (
      template &&
      isPublishedTemplateRow(template) &&
      isPublicTemplateRow(template)
    )
    {
      reachableTemplateIds.add(template._id)
    }
  }

  const reachableRankingIds = new Set<Id<'publishedRankings'>>()
  for (const ranking of rankings)
  {
    if (
      ranking &&
      isPublicRankingRow(ranking) &&
      reachableTemplateIds.has(ranking.sourceTemplateId)
    )
    {
      reachableRankingIds.add(ranking._id)
    }
  }
  return reachableRankingIds
}

// template-side mirror of loadReachableLivePublicRankingIds: a board counts as
// live-via-template only when its livePublicTemplateId resolves to a published &
// publicly-listable template — so an unpublished/unlisted source demotes it
const loadReachableLivePublicTemplateIds = async (
  ctx: QueryCtx,
  boards: readonly Doc<'boards'>[]
): Promise<ReadonlySet<Id<'templates'>>> =>
{
  const templateIds = Array.from(
    new Set(
      boards.flatMap((board) =>
        board.livePublicTemplateId != null ? [board.livePublicTemplateId] : []
      )
    )
  )
  if (templateIds.length === 0) return new Set()

  const templates = await Promise.all(templateIds.map((id) => ctx.db.get(id)))
  const reachableTemplateIds = new Set<Id<'templates'>>()
  for (const template of templates)
  {
    if (
      template &&
      isPublishedTemplateRow(template) &&
      isPublicTemplateRow(template)
    )
    {
      reachableTemplateIds.add(template._id)
    }
  }
  return reachableTemplateIds
}

const projectLibraryRow = async (
  board: Doc<'boards'>,
  rowCtx: LibraryRowContext
): Promise<LibraryBoardListItem> =>
{
  const coverItems: LibraryBoardCoverItem[] = await Promise.all(
    board.librarySummary.coverItems.map(async (item) => ({
      label: item.label ?? null,
      externalId: item.externalId,
      mediaUrl: item.storageId
        ? await rowCtx.loadStorageUrl(item.storageId)
        : null,
      ...pickCoverRenderFields(item),
    }))
  )

  const category = board.sourceTemplate.category ?? DEFAULT_LIBRARY_CATEGORY
  const hasPublishedOutput =
    rowCtx.hasLiveTemplate || rowCtx.hasLivePublicRanking

  const rankedItemCount = Math.max(
    0,
    board.activeItemCount - board.unrankedItemCount
  )

  const publishState = deriveLibraryPublishState({
    rankedItemCount,
    hasPublishedOutput,
  })
  const syncState = deriveLibrarySyncState({
    materializationState: board.materializationState,
  })

  return {
    externalId: board.externalId,
    title: board.title,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
    revision: board.revision,
    activeItemCount: board.activeItemCount,
    unrankedItemCount: board.unrankedItemCount,
    rankedItemCount,
    publishState,
    syncState,
    visibility: hasPublishedOutput ? 'public' : 'private',
    category,
    sourceTemplateSizeClass: board.sourceTemplate.sizeClass,
    sourceTemplateCoverMedia: rowCtx.sourceCover.media,
    sourceTemplateCoverFraming: rowCtx.sourceCover.framing,
    coverItems,
    autoPlate: board.autoPlate ?? null,
    defaultItemImageFit: board.defaultItemImageFit ?? null,
    defaultItemImagePadding: board.defaultItemImagePadding ?? null,
    itemAspectRatio: board.itemAspectRatio ?? null,
    paletteId: board.paletteId ?? rowCtx.userDefaultPaletteId,
    tierCount: board.librarySummary.tierCount,
    tierColors: board.librarySummary.tierColors,
    tierBreakdown: board.librarySummary.tierBreakdown,
    pinned: false,
  }
}
