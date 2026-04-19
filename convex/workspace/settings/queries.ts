// convex/workspace/settings/queries.ts
// user settings queries — read-path is implemented, write-path lives in mutations.ts

import { v } from 'convex/values'
import { query } from '../../_generated/server'
import { getCurrentUserId } from '../../lib/auth'
import { cloudSettingsReadValidator } from '../../lib/validators'

// return the authenticated caller's persisted AppSettings along w/ the cloud
// row's updatedAt timestamp, or null if unauthenticated or no settings row
// exists yet. callers should treat null as "use client-side defaults"; the
// timestamp feeds the client's lastSyncedAt sidecar for merge-direction logic
export const getMySettings = query({
  args: {},
  returns: v.union(cloudSettingsReadValidator, v.null()),
  handler: async (ctx) =>
  {
    const userId = await getCurrentUserId(ctx)
    if (!userId)
    {
      return null
    }
    const row = await ctx.db
      .query('userSettings')
      .withIndex('byUser', (q) => q.eq('userId', userId))
      .unique()
    if (!row)
    {
      return null
    }
    return { settings: row.settings, updatedAt: row.updatedAt }
  },
})
