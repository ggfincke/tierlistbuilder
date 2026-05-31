// convex/marketplace/rankings/seed/cleanup.ts
// seed cascade deletes. parent row inline (frees seedExternalId/slug);
// items/tiers via scheduled cascade so cost stays fixed in items count.

import { v } from 'convex/values'
import { internalMutation, type MutationCtx } from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import type { Doc } from '../../../_generated/dataModel'
import {
  buildBoardChildCascadePhases,
  type BoardChildCascadePhase,
  runCascadePhaseMachine,
} from '../../../lib/cascadeDelete'
import { isDevResetActive } from '../../../dev/resetLock'

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
    internal.marketplace.rankings.maintenance.cascade.cascadeDeleteRanking,
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
    internal.marketplace.rankings.seed.cleanup.cascadeSeedBoardChildren,
    { boardId: board._id }
  )
  await ctx.db.delete(board._id)
}

export const cascadeSeedBoardChildren = internalMutation({
  args: {
    boardId: v.id('boards'),
    cursor: v.optional(v.union(v.string(), v.null())),
    phase: v.optional(v.union(v.literal('items'), v.literal('tiers'))),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    if (await isDevResetActive(ctx)) return null
    const phase: BoardChildCascadePhase = args.phase ?? 'items'
    await runCascadePhaseMachine({
      ctx,
      schedule: async (nextArgs) =>
        await ctx.scheduler.runAfter(
          0,
          internal.marketplace.rankings.seed.cleanup.cascadeSeedBoardChildren,
          nextArgs
        ),
      parentKey: 'boardId',
      parentId: args.boardId,
      phase,
      cursor: args.cursor,
      phases: buildBoardChildCascadePhases(ctx, args.boardId),
    })

    return null
  },
})
