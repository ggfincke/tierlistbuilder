// convex/marketplace/rankings/seedCleanup.ts
// compatibility shim for seed cleanup jobs queued before the path split

import { v } from 'convex/values'
import { internalMutation } from '../../_generated/server'
import { internal } from '../../_generated/api'

export const cascadeSeedBoardChildren = internalMutation({
  args: {
    boardId: v.id('boards'),
    cursor: v.optional(v.union(v.string(), v.null())),
    phase: v.optional(v.union(v.literal('items'), v.literal('tiers'))),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
    await ctx.runMutation(
      internal.marketplace.rankings.seed.cleanup.cascadeSeedBoardChildren,
      args
    ),
})
