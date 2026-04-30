// convex/workspace/boards/queries.ts
// board queries — list & lookup for the authenticated caller

import { ConvexError, v } from 'convex/values'
import { query, type QueryCtx } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import {
  deriveLibraryBoardStatus,
  type BoardListItem,
  type DeletedBoardListItem,
  type LibraryBoardCoverItem,
  type LibraryBoardListItem,
} from '@tierlistbuilder/contracts/workspace/board'
import type { TemplateCategory } from '@tierlistbuilder/contracts/marketplace/category'
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
} from '../../lib/validators'
import { loadBoardCloudState } from '../sync/boardStateLoader'
import { loadBoundedBoardRows } from '../sync/loadBoundedBoardRows'

const MAX_BOARDS_PER_USER = 200
const MAX_DELETED_BOARDS_PER_USER = 200
const MAX_BOARD_STATE_BATCH = 3
const DEFAULT_LIBRARY_PALETTE_ID: PaletteId = 'classic'
const DEFAULT_LIBRARY_CATEGORY: TemplateCategory = 'other'

const toBoardListItem = (board: Doc<'boards'>): BoardListItem => ({
  externalId: board.externalId,
  title: board.title,
  createdAt: board.createdAt,
  updatedAt: board.updatedAt,
  revision: board.revision ?? 0,
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

// resolve one owned board by its stable externalId
export const getBoardByExternalId = query({
  args: { externalId: v.string() },
  returns: v.union(boardListItemValidator, v.null()),
  handler: async (ctx, args): Promise<BoardListItem | null> =>
  {
    const userId = await getCurrentUserId(ctx)
    if (!userId)
    {
      return null
    }

    const board = await findOwnedActiveBoardByExternalId(
      ctx,
      args.externalId,
      userId
    )
    if (!board)
    {
      return null
    }

    return toBoardListItem(board)
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

    const board = await findOwnedActiveBoardByExternalId(
      ctx,
      args.boardExternalId,
      userId
    )
    if (!board)
    {
      return null
    }

    const { serverTiers, serverItems } = await loadBoundedBoardRows(
      ctx,
      board._id
    )

    return loadBoardCloudState(ctx, board, serverTiers, serverItems)
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
      args.boardExternalIds.map(async (boardExternalId) =>
      {
        const board = await findOwnedActiveBoardByExternalId(
          ctx,
          boardExternalId,
          userId
        )
        if (!board)
        {
          return null
        }

        const { serverTiers, serverItems } = await loadBoundedBoardRows(
          ctx,
          board._id
        )

        return loadBoardCloudState(ctx, board, serverTiers, serverItems)
      })
    )
  },
})

const hasLivePublicTemplateForBoard = async (
  ctx: QueryCtx,
  userId: Id<'users'>,
  sourceBoardExternalId: string
): Promise<boolean> =>
{
  const rows = await ctx.db
    .query('templates')
    .withIndex('byAuthorSourceBoardVisibilityUnpublished', (q) =>
      q
        .eq('authorId', userId)
        .eq('sourceBoardExternalId', sourceBoardExternalId)
        .eq('visibility', 'public')
        .eq('unpublishedAt', null)
    )
    .take(1)

  return rows.length > 0
}

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
    const settingsRow = await ctx.db
      .query('userSettings')
      .withIndex('byUser', (q) => q.eq('userId', userId))
      .unique()
    const userDefaultPaletteId: PaletteId =
      settingsRow?.settings.paletteId ?? DEFAULT_LIBRARY_PALETTE_ID

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

    const publishedSourceEntries = await Promise.all(
      boards.map(
        async (board) =>
          [
            board.externalId,
            await hasLivePublicTemplateForBoard(ctx, userId, board.externalId),
          ] as const
      )
    )
    const publishedSourceBoardIds = new Set(
      publishedSourceEntries
        .filter(([, hasPublishedTemplate]) => hasPublishedTemplate)
        .map(([externalId]) => externalId)
    )

    // dedupe sourceTemplate fetches across boards forked from the same
    // template — a user w/ 5 forks of the same template only loads it once
    const sourceTemplateCache = new Map<
      Id<'templates'>,
      Promise<Doc<'templates'> | null>
    >()
    const loadSourceTemplate = (
      templateId: Id<'templates'>
    ): Promise<Doc<'templates'> | null> =>
    {
      const existing = sourceTemplateCache.get(templateId)
      if (existing) return existing
      const pending = ctx.db.get(templateId)
      sourceTemplateCache.set(templateId, pending)
      return pending
    }

    const storageUrlCache = new Map<Id<'_storage'>, Promise<string | null>>()
    const loadStorageUrl = (
      storageId: Id<'_storage'>
    ): Promise<string | null> =>
    {
      const existing = storageUrlCache.get(storageId)
      if (existing) return existing
      const pending = ctx.storage.getUrl(storageId)
      storageUrlCache.set(storageId, pending)
      return pending
    }

    return Promise.all(
      boards.map((board) =>
        projectLibraryRow(board, {
          publishedSourceBoardIds,
          userDefaultPaletteId,
          loadSourceTemplate,
          loadStorageUrl,
        })
      )
    )
  },
})

interface LibraryRowContext
{
  publishedSourceBoardIds: ReadonlySet<string>
  userDefaultPaletteId: PaletteId
  loadSourceTemplate: (
    templateId: Id<'templates'>
  ) => Promise<Doc<'templates'> | null>
  loadStorageUrl: (storageId: Id<'_storage'>) => Promise<string | null>
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
    }))
  )

  // category inherits from the source template; blank-pool & dangling-link
  // boards fall to 'other'
  let category: TemplateCategory = DEFAULT_LIBRARY_CATEGORY
  if (board.sourceTemplateId)
  {
    const sourceTemplate = await rowCtx.loadSourceTemplate(
      board.sourceTemplateId
    )
    if (sourceTemplate)
    {
      category = sourceTemplate.category
    }
  }

  const hasPublishedTemplate = rowCtx.publishedSourceBoardIds.has(
    board.externalId
  )
  const status = deriveLibraryBoardStatus({
    activeItemCount: board.activeItemCount,
    unrankedItemCount: board.unrankedItemCount,
    hasPublishedTemplate,
  })

  const rankedItemCount = Math.max(
    0,
    board.activeItemCount - board.unrankedItemCount
  )

  return {
    externalId: board.externalId,
    title: board.title,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
    revision: board.revision ?? 0,
    activeItemCount: board.activeItemCount,
    unrankedItemCount: board.unrankedItemCount,
    rankedItemCount,
    status,
    visibility: hasPublishedTemplate ? 'public' : 'private',
    category,
    coverItems,
    paletteId: board.paletteId ?? rowCtx.userDefaultPaletteId,
    tierColors: board.librarySummary.tierColors,
    tierBreakdown: board.librarySummary.tierBreakdown,
    pinned: false,
  }
}
