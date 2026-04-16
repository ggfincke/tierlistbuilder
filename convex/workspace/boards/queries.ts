// convex/workspace/boards/queries.ts
// board queries — list & lookup for the authenticated caller

import { v } from 'convex/values'
import { query } from '../../_generated/server'
import type { Doc } from '../../_generated/dataModel'
import type { BoardListItem } from '@tierlistbuilder/contracts/workspace/board'
import { getCurrentUser } from '../../lib/auth'

const MAX_BOARDS_PER_USER = 200

const toBoardListItem = (board: Doc<'boards'>): BoardListItem => ({
  externalId: board.externalId,
  title: board.title,
  createdAt: board.createdAt,
  updatedAt: board.updatedAt,
  revision: board.revision ?? 0,
})

// list the authenticated caller's non-deleted boards, newest updated first
export const getMyBoards = query({
  args: {},
  handler: async (ctx): Promise<BoardListItem[]> =>
  {
    const user = await getCurrentUser(ctx)
    if (!user)
    {
      return []
    }

    const rows = await ctx.db
      .query('boards')
      .withIndex('byOwnerAndDeleted', (q) =>
        q.eq('ownerId', user._id).eq('deletedAt', null)
      )
      .take(MAX_BOARDS_PER_USER)

    return rows
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(toBoardListItem)
  },
})

// resolve one owned board by its stable externalId
export const getBoardByExternalId = query({
  args: { externalId: v.string() },
  handler: async (ctx, args): Promise<BoardListItem | null> =>
  {
    const user = await getCurrentUser(ctx)
    if (!user)
    {
      return null
    }

    const board = await ctx.db
      .query('boards')
      .withIndex('byExternalId', (q) => q.eq('externalId', args.externalId))
      .unique()

    if (!board || board.ownerId !== user._id || board.deletedAt !== null)
    {
      return null
    }

    return toBoardListItem(board)
  },
})
