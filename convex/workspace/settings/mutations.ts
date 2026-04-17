// convex/workspace/settings/mutations.ts
// user settings mutations — single-row-per-user upsert w/ last-write-wins semantics.
// concurrent-edit conflicts collapse to whichever debounced flush lands last

import { mutation } from '../../_generated/server'
import { requireCurrentUserId } from '../../lib/auth'
import { appSettingsValidator } from '../../lib/validators'
import { validateHexColor } from '../../lib/hexColor'

// upsert the authenticated caller's AppSettings — replaces any existing row.
// returns the wall-clock updatedAt the row landed at so the client can stamp
// its lastSyncedAt sidecar
export const upsertMySettings = mutation({
  args: { settings: appSettingsValidator },
  handler: async (ctx, args): Promise<{ updatedAt: number }> =>
  {
    const userId = await requireCurrentUserId(ctx)

    // v.string() accepts arbitrary length & format — enforce hex shape here
    // so a client can't smuggle a multi-KB payload or a malformed color
    // into the background-override columns
    if (args.settings.exportBackgroundOverride !== null)
    {
      validateHexColor(
        args.settings.exportBackgroundOverride,
        'exportBackgroundOverride'
      )
    }
    if (args.settings.boardBackgroundOverride !== null)
    {
      validateHexColor(
        args.settings.boardBackgroundOverride,
        'boardBackgroundOverride'
      )
    }

    const now = Date.now()

    const existing = await ctx.db
      .query('userSettings')
      .withIndex('byUser', (q) => q.eq('userId', userId))
      .unique()

    if (existing)
    {
      await ctx.db.patch(existing._id, {
        settings: args.settings,
        updatedAt: now,
      })
    }
    else
    {
      await ctx.db.insert('userSettings', {
        userId,
        settings: args.settings,
        updatedAt: now,
      })
    }

    return { updatedAt: now }
  },
})
