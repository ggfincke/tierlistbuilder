// convex/marketplace/rankings/internal.ts
// internal ranking cleanup jobs

import { v, type Infer } from 'convex/values'
import { internalMutation } from '../../_generated/server'
import { internal } from '../../_generated/api'
import {
  CASCADE_DELETE_PAGE_SIZE,
  deleteCascadePageAndSchedule,
} from '../../lib/cascadeDelete'

const cascadePhaseValidator = v.union(v.literal('items'), v.literal('tiers'))
type CascadePhase = Infer<typeof cascadePhaseValidator>

export const cascadeDeleteRanking = internalMutation({
  args: {
    rankingId: v.id('publishedRankings'),
    cursor: v.optional(v.union(v.string(), v.null())),
    phase: v.optional(cascadePhaseValidator),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const phase: CascadePhase = args.phase ?? 'items'
    if (phase === 'items')
    {
      const page = await ctx.db
        .query('publishedRankingItems')
        .withIndex('byRanking', (q) => q.eq('rankingId', args.rankingId))
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
            internal.marketplace.rankings.internal.cascadeDeleteRanking,
            nextArgs
          ),
        parentKey: 'rankingId',
        parentId: args.rankingId,
        phase: 'items',
        nextPhase: 'tiers',
      })
      if (scheduled) return null
    }

    const page = await ctx.db
      .query('publishedRankingTiers')
      .withIndex('byRanking', (q) => q.eq('rankingId', args.rankingId))
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
          internal.marketplace.rankings.internal.cascadeDeleteRanking,
          nextArgs
        ),
      parentKey: 'rankingId',
      parentId: args.rankingId,
      phase: 'tiers',
    })
    if (scheduled) return null

    return null
  },
})
