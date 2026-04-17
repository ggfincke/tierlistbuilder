// convex/workspace/boards/internal.ts
// internal-only board cleanup helpers

import { v } from 'convex/values'
import { internalMutation } from '../../_generated/server'
import { internal } from '../../_generated/api'

const CASCADE_DELETE_BATCH_SIZE = 256

// cascade phases — items first, then tiers, then the board row itself.
// each phase walks its own cursor so a large board that exceeds the batch
// size doesn't loop forever on the first 256 rows (as .take() would)
type CascadePhase = 'items' | 'tiers'

// cascade delete a board's items, tiers, & final board row. runs in phases:
// 'items' consumes every boardItems row paginated by the byBoardAndTier
// index, 'tiers' does the same for boardTiers, then the board row is
// deleted. phase+cursor state is passed through ctx.scheduler.runAfter so
// each invocation stays inside the Convex mutation transaction limits
export const cascadeDeleteBoard = internalMutation({
  args: {
    boardId: v.id('boards'),
    cursor: v.optional(v.union(v.string(), v.null())),
    phase: v.optional(v.union(v.literal('items'), v.literal('tiers'))),
  },
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
          numItems: CASCADE_DELETE_BATCH_SIZE,
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
        numItems: CASCADE_DELETE_BATCH_SIZE,
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

    // assets newly orphaned by this cascade are reaped by the daily
    // gcOrphanedMediaAssets cron — running an inline scan here would
    // require an O(n_items_in_board) walk of the byMedia index per cascade
    // & duplicate the work the GC pass already does globally
    return null
  },
})
