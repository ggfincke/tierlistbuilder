// convex/workspace/boards/internal.ts
// internal-only board cleanup helpers

import { v } from 'convex/values'
import { internalMutation } from '../../_generated/server'
import { internal } from '../../_generated/api'
import { BATCH_LIMITS } from '../../lib/limits'

// cascade phases — items first, then tiers, then the board row itself.
// each phase walks its own cursor so a large board that exceeds the batch
// size doesn't loop forever on the first 256 rows (as .take() would)
type CascadePhase = 'items' | 'tiers'

// cascade delete a board's items, tiers, & final board row in phases.
// phase+cursor state passed through ctx.scheduler.runAfter so each
// invocation stays inside the Convex mutation transaction limits
export const cascadeDeleteBoard = internalMutation({
  args: {
    boardId: v.id('boards'),
    cursor: v.optional(v.union(v.string(), v.null())),
    phase: v.optional(v.union(v.literal('items'), v.literal('tiers'))),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const board = await ctx.db.get(args.boardId)
    if (!board)
    {
      return null
    }

    const phase: CascadePhase = args.phase ?? 'items'

    if (phase === 'items')
    {
      const page = await ctx.db
        .query('boardItems')
        .withIndex('byBoardAndTier', (q) => q.eq('boardId', args.boardId))
        .paginate({
          numItems: BATCH_LIMITS.cascadeDelete,
          cursor: args.cursor ?? null,
        })

      await Promise.all(page.page.map((item) => ctx.db.delete(item._id)))

      if (!page.isDone)
      {
        await ctx.scheduler.runAfter(
          0,
          internal.workspace.boards.internal.cascadeDeleteBoard,
          {
            boardId: args.boardId,
            cursor: page.continueCursor,
            phase: 'items',
          }
        )
        return null
      }

      // items drained — kick off the tiers phase w/ a fresh cursor
      await ctx.scheduler.runAfter(
        0,
        internal.workspace.boards.internal.cascadeDeleteBoard,
        { boardId: args.boardId, cursor: null, phase: 'tiers' }
      )
      return null
    }

    // phase === 'tiers'
    const tierPage = await ctx.db
      .query('boardTiers')
      .withIndex('byBoard', (q) => q.eq('boardId', args.boardId))
      .paginate({
        numItems: BATCH_LIMITS.cascadeDelete,
        cursor: args.cursor ?? null,
      })

    await Promise.all(tierPage.page.map((tier) => ctx.db.delete(tier._id)))

    if (!tierPage.isDone)
    {
      await ctx.scheduler.runAfter(
        0,
        internal.workspace.boards.internal.cascadeDeleteBoard,
        {
          boardId: args.boardId,
          cursor: tierPage.continueCursor,
          phase: 'tiers',
        }
      )
      return null
    }

    await ctx.db.delete(args.boardId)

    // newly orphaned assets are reaped by the daily gcOrphanedMediaAssets cron —
    // an inline scan would duplicate the GC pass & require O(n_items) byMedia walks
    return null
  },
})
