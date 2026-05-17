// convex/marketplace/rankings/internal.ts
// compatibility shim for ranking cleanup jobs queued before the path split

import { v } from 'convex/values'
import { internalMutation } from '../../_generated/server'
import { internal } from '../../_generated/api'

const cascadePhaseValidator = v.union(v.literal('items'), v.literal('tiers'))

export const cascadeDeleteRanking = internalMutation({
  args: {
    rankingId: v.id('publishedRankings'),
    cursor: v.optional(v.union(v.string(), v.null())),
    phase: v.optional(cascadePhaseValidator),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
    await ctx.runMutation(
      internal.marketplace.rankings.maintenance.cascade.cascadeDeleteRanking,
      args
    ),
})
