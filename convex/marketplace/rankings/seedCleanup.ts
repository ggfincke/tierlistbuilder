// convex/marketplace/rankings/seedCleanup.ts
// seed cascade deletes. parent row inline (frees seedExternalId/slug);
// items/tiers via scheduled cascade so cost stays fixed in items count.

import { v } from 'convex/values'
import { internalMutation, type MutationCtx } from '../../_generated/server'
import { internal } from '../../_generated/api'
import type { Doc } from '../../_generated/dataModel'
import {
  CASCADE_DELETE_PAGE_SIZE,
  deleteCascadePageAndSchedule,
} from '../../lib/cascadeDelete'

export const deleteSeedRankingWithChildren = async (
  ctx: MutationCtx,
  ranking: Doc<'publishedRankings'>
): Promise<void> =>
{
  // schedule children cleanup BEFORE deleting the parent so a crash between
  // the two leaves the scheduler job intact (the job tolerates a missing
  // ranking — it just walks the byRanking index).
  await ctx.scheduler.runAfter(
    0,
    internal.marketplace.rankings.internal.cascadeDeleteRanking,
    { rankingId: ranking._id }
  )
  await ctx.db.delete(ranking._id)
}

export const deleteSeedBoardWithChildren = async (
  ctx: MutationCtx,
  board: Doc<'boards'>
): Promise<void> =>
{
  await ctx.scheduler.runAfter(
    0,
    internal.marketplace.rankings.seedCleanup.cascadeSeedBoardChildren,
    { boardId: board._id }
  )
  await ctx.db.delete(board._id)
}

// items + tiers cleanup for an already-deleted seed board row.
// mirrors workspace/boards/internal.ts:cascadeDeleteBoard, minus the final
// board-row delete (the seed pipeline already removed it inline).
type CascadePhase = 'items' | 'tiers'

export const cascadeSeedBoardChildren = internalMutation({
  args: {
    boardId: v.id('boards'),
    cursor: v.optional(v.union(v.string(), v.null())),
    phase: v.optional(v.union(v.literal('items'), v.literal('tiers'))),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const phase: CascadePhase = args.phase ?? 'items'

    if (phase === 'items')
    {
      const page = await ctx.db
        .query('boardItems')
        .withIndex('byBoardAndTier', (q) => q.eq('boardId', args.boardId))
        .paginate({
          numItems: CASCADE_DELETE_PAGE_SIZE,
          cursor: args.cursor ?? null,
        })

      const scheduled = await deleteCascadePageAndSchedule({
        ctx,
        page,
        schedule: async (nextArgs) =>
          await ctx.scheduler.runAfter(
            0,
            internal.marketplace.rankings.seedCleanup.cascadeSeedBoardChildren,
            nextArgs
          ),
        parentKey: 'boardId',
        parentId: args.boardId,
        phase: 'items',
        nextPhase: 'tiers',
      })
      if (scheduled) return null
    }

    const tierPage = await ctx.db
      .query('boardTiers')
      .withIndex('byBoard', (q) => q.eq('boardId', args.boardId))
      .paginate({
        numItems: CASCADE_DELETE_PAGE_SIZE,
        cursor: args.cursor ?? null,
      })

    await deleteCascadePageAndSchedule({
      ctx,
      page: tierPage,
      schedule: async (nextArgs) =>
        await ctx.scheduler.runAfter(
          0,
          internal.marketplace.rankings.seedCleanup.cascadeSeedBoardChildren,
          nextArgs
        ),
      parentKey: 'boardId',
      parentId: args.boardId,
      phase: 'tiers',
    })

    return null
  },
})
