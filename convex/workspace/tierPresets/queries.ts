// convex/workspace/tierPresets/queries.ts
// tier preset queries — list-all read path for the authenticated caller.
// built-in presets are client-side only, so this returns user presets only

import type { Doc } from '../../_generated/dataModel'
import type { TierPresetCloudRow } from '@tierlistbuilder/contracts/workspace/cloudPreset'
import { query } from '../../_generated/server'
import { getCurrentUserId } from '../../lib/auth'

const MAX_PRESETS_PER_USER = 200

const toCloudRow = (row: Doc<'tierPresets'>): TierPresetCloudRow => ({
  externalId: row.externalId,
  name: row.name,
  tiers: row.tiers,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

// list the authenticated caller's saved tier presets, newest updated first.
// returns an empty list when unauthenticated so callers can use the same
// shape regardless of auth state
export const getMyTierPresets = query({
  args: {},
  handler: async (ctx): Promise<TierPresetCloudRow[]> =>
  {
    const userId = await getCurrentUserId(ctx)
    if (!userId)
    {
      return []
    }

    const rows = await ctx.db
      .query('tierPresets')
      .withIndex('byOwner', (q) => q.eq('ownerId', userId))
      .order('desc')
      .take(MAX_PRESETS_PER_USER)

    return rows.map(toCloudRow)
  },
})
