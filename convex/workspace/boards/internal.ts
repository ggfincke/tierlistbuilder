// convex/workspace/boards/internal.ts
// internal-only board cleanup helpers

import { v } from 'convex/values'
import { internalMutation } from '../../_generated/server'
import { internal } from '../../_generated/api'

const CASCADE_DELETE_BATCH_SIZE = 256

// cascade delete a board's items, tiers, & final board row
export const cascadeDeleteBoard = internalMutation({
  args: { boardId: v.id('boards') },
  handler: async (ctx, args): Promise<null> =>
  {
    const board = await ctx.db.get(args.boardId)
    if (!board)
    {
      return null
    }

    const itemBatch = await ctx.db
      .query('boardItems')
      .withIndex('byBoardAndTier', (q) => q.eq('boardId', args.boardId))
      .take(CASCADE_DELETE_BATCH_SIZE)

    await Promise.all(itemBatch.map((item) => ctx.db.delete(item._id)))

    if (itemBatch.length === CASCADE_DELETE_BATCH_SIZE)
    {
      await ctx.scheduler.runAfter(
        0,
        internal.workspace.boards.internal.cascadeDeleteBoard,
        { boardId: args.boardId }
      )
      return null
    }

    const tierBatch = await ctx.db
      .query('boardTiers')
      .withIndex('byBoard', (q) => q.eq('boardId', args.boardId))
      .take(CASCADE_DELETE_BATCH_SIZE)

    await Promise.all(tierBatch.map((tier) => ctx.db.delete(tier._id)))

    if (tierBatch.length === CASCADE_DELETE_BATCH_SIZE)
    {
      await ctx.scheduler.runAfter(
        0,
        internal.workspace.boards.internal.cascadeDeleteBoard,
        { boardId: args.boardId }
      )
      return null
    }

    await ctx.db.delete(args.boardId)
    return null
  },
})
