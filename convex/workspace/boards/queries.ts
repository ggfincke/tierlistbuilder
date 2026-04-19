// convex/workspace/boards/queries.ts
// board queries — list & lookup for the authenticated caller

import { ConvexError, v } from 'convex/values'
import { query } from '../../_generated/server'
import type { Doc } from '../../_generated/dataModel'
import type {
  BoardListItem,
  DeletedBoardListItem,
} from '@tierlistbuilder/contracts/workspace/board'
import type { CloudBoardState } from '@tierlistbuilder/contracts/workspace/cloudBoard'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { getCurrentUserId, requireCurrentUserId } from '../../lib/auth'
import { findOwnedActiveBoardByExternalId } from '../../lib/permissions'
import {
  boardListItemValidator,
  cloudBoardStateValidator,
  deletedBoardListItemValidator,
} from '../../lib/validators'
import { loadBoardCloudState } from '../sync/boardStateLoader'
import { loadBoundedBoardRows } from '../sync/loadBoundedBoardRows'

const MAX_BOARDS_PER_USER = 200
const MAX_DELETED_BOARDS_PER_USER = 200
const MAX_BOARD_STATE_BATCH = 3

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

    // gt(0) excludes the index's null gap & deletedAt === 0 (never set in practice).
    // order('desc') puts most-recently-deleted rows first
    const rows = await ctx.db
      .query('boards')
      .withIndex('byOwnerAndDeleted', (q) =>
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
