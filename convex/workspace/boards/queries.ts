// convex/workspace/boards/queries.ts
// board queries — list & lookup for the authenticated caller

import { v } from 'convex/values'
import { query } from '../../_generated/server'
import type { Doc } from '../../_generated/dataModel'
import type { BoardListItem } from '@tierlistbuilder/contracts/workspace/board'
import type { CloudBoardState } from '@tierlistbuilder/contracts/workspace/cloudBoard'
import { getCurrentUserId } from '../../lib/auth'
import { findOwnedActiveBoardByExternalId } from '../../lib/permissions'
import { loadBoardCloudState } from '../sync/boardStateLoader'
import { loadBoundedBoardRows } from '../sync/loadBoundedBoardRows'

const MAX_BOARDS_PER_USER = 200
const MAX_BOARD_STATE_BATCH = 3

const toBoardListItem = (board: Doc<'boards'>): BoardListItem => ({
  externalId: board.externalId,
  title: board.title,
  createdAt: board.createdAt,
  updatedAt: board.updatedAt,
  revision: board.revision ?? 0,
})

// list the authenticated caller's non-deleted boards, newest updated first.
// the byOwnerDeletedUpdatedAt index has updatedAt as the trailing field so
// order('desc') returns rows in the order we want & avoids a full-table
// read + in-memory sort that would grow w/ the user's board count
export const getMyBoards = query({
  args: {},
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

// fetch the full server-side state for an owned board — used by the
// cloud-pull path on first sign-in & by conflict resolution to materialize
// the cloud copy locally. returns the same shape upsertBoardState's
// conflict response uses
export const getBoardStateByExternalId = query({
  args: { boardExternalId: v.string() },
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

export const getBoardStatesByExternalIds = query({
  args: { boardExternalIds: v.array(v.string()) },
  handler: async (ctx, args): Promise<Array<CloudBoardState | null>> =>
  {
    const userId = await getCurrentUserId(ctx)
    if (!userId)
    {
      return args.boardExternalIds.map(() => null)
    }

    if (args.boardExternalIds.length > MAX_BOARD_STATE_BATCH)
    {
      throw new Error(
        `too many boardExternalIds: ${args.boardExternalIds.length} exceeds ${MAX_BOARD_STATE_BATCH}`
      )
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
