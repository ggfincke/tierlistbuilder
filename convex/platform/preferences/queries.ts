// convex/platform/preferences/queries.ts
// user preference queries — write path lives in mutations.ts

import { v } from 'convex/values'
import { query } from '../../_generated/server'
import { getCurrentUserId } from '../../lib/auth'
import { cloudPreferencesReadValidator } from '../../lib/validators'

// return the caller's persisted AppPreferences + cloud updatedAt, or null when
// unauthenticated / no row yet. null -> client-side defaults; timestamp feeds
// the lastSyncedAt sidecar for merge-direction logic
export const getMyPreferences = query({
  args: {},
  returns: v.union(cloudPreferencesReadValidator, v.null()),
  handler: async (ctx) =>
  {
    const userId = await getCurrentUserId(ctx)
    if (!userId)
    {
      return null
    }
    const row = await ctx.db
      .query('userPreferences')
      .withIndex('byUser', (q) => q.eq('userId', userId))
      .unique()
    if (!row)
    {
      return null
    }
    return { preferences: row.preferences, updatedAt: row.updatedAt }
  },
})
