// convex/workspace/settings/queries.ts
// user settings queries — read-path is implemented, write-path lives in mutations.ts

import { v } from 'convex/values'
import { query } from '../../_generated/server'
import { getCurrentUserId } from '../../lib/auth'
import { cloudSettingsReadValidator } from '../../lib/validators'

// return the caller's persisted AppSettings + cloud updatedAt, or null when
// unauthenticated / no row yet. null -> client-side defaults; timestamp feeds
// the lastSyncedAt sidecar for merge-direction logic
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
