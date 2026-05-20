// convex/platform/preferences/mutations.ts
// user preference mutations — single-row-per-user upsert w/ last-write-wins.
// concurrent-edit conflicts collapse to whichever debounced flush lands last

import { v } from 'convex/values'
import {
  isValidLabelFontSizePx,
  LABEL_FONT_SIZE_PX_MAX,
  LABEL_FONT_SIZE_PX_MIN,
} from '@tierlistbuilder/contracts/workspace/board'
import { mutation } from '../../_generated/server'
import { requireCurrentUserId } from '../../lib/auth'
import { appPreferencesValidator } from '../../lib/validators/platform'
import { validateHexColor } from '../../lib/hexColor'
import { failInput } from '../../lib/text'

const HEX_COLOR_PREFERENCE_KEYS = [
  'exportBackgroundOverride',
  'boardBackgroundOverride',
] as const

// upsert the authenticated caller's AppPreferences — replaces any existing row.
// returns the wall-clock updatedAt the row landed at so the client can stamp
// its lastSyncedAt sidecar
export const upsertMyPreferences = mutation({
  args: { preferences: appPreferencesValidator },
  returns: v.object({ updatedAt: v.number() }),
  handler: async (ctx, args): Promise<{ updatedAt: number }> =>
  {
    const userId = await requireCurrentUserId(ctx)

    // v.string() accepts arbitrary length & format; enforce hex shape on
    // nullable color override columns before persisting.
    for (const key of HEX_COLOR_PREFERENCE_KEYS)
    {
      const value = args.preferences[key]
      if (value !== null) validateHexColor(value, key)
    }
    if (!isValidLabelFontSizePx(args.preferences.defaultLabelFontSizePx))
    {
      failInput(
        `invalid defaultLabelFontSizePx: must be within [${LABEL_FONT_SIZE_PX_MIN}, ${LABEL_FONT_SIZE_PX_MAX}]`
      )
    }

    const now = Date.now()

    const existing = await ctx.db
      .query('userPreferences')
      .withIndex('byUser', (q) => q.eq('userId', userId))
      .unique()

    if (existing)
    {
      await ctx.db.patch(existing._id, {
        preferences: args.preferences,
        updatedAt: now,
      })
    }
    else
    {
      await ctx.db.insert('userPreferences', {
        userId,
        preferences: args.preferences,
        updatedAt: now,
      })
    }

    return { updatedAt: now }
  },
})
