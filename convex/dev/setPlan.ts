// convex/dev/setPlan.ts
// dev tool: set a user's plan (free/plus) by email for local testing of plan gates
// temporary helper; safe to delete once done. gated behind the dev sample-seed env

import { ConvexError, v } from 'convex/values'
import { internalMutation } from '../_generated/server'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { userPlanValidator } from '../lib/validators/platform'
import { requireDevSampleSeedAuthorized } from './seedGate'

export const setPlan = internalMutation({
  args: {
    email: v.string(),
    plan: userPlanValidator,
  },
  returns: v.object({
    userId: v.id('users'),
    email: v.string(),
    plan: userPlanValidator,
  }),
  handler: async (ctx, args) =>
  {
    requireDevSampleSeedAuthorized('setPlan')

    const user = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', args.email))
      .unique()
    if (!user)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: `no user w/ email ${args.email}`,
      })
    }

    await ctx.db.patch(user._id, { plan: args.plan, updatedAt: Date.now() })
    return { userId: user._id, email: args.email, plan: args.plan }
  },
})
