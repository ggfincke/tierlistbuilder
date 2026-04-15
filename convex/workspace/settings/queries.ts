// convex/workspace/settings/queries.ts
// user settings queries — read-path is implemented, write-path lives in mutations.ts

import { query } from '../../_generated/server'
import { getCurrentUser } from '../../lib/auth'

// return the authenticated caller's persisted AppSettings, or null if
// unauthenticated or no settings row exists yet
// callers should treat null as "use client-side defaults"
export const getMySettings = query({
  args: {},
  handler: async (ctx) =>
  {
    const user = await getCurrentUser(ctx)
    if (!user)
    {
      return null
    }
    const row = await ctx.db
      .query('userSettings')
      .withIndex('byUser', (q) => q.eq('userId', user._id))
      .unique()
    return row?.settings ?? null
  },
})
