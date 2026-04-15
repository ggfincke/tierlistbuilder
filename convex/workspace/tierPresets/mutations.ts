// convex/workspace/tierPresets/mutations.ts
// tier preset mutations — all stubbed; real implementations land in the presets sync PR

import { mutation } from '../../_generated/server'
import { v } from 'convex/values'
import { tierPresetTiersValidator } from '../../lib/validators'

// create a new user-owned tier preset
// todo: implement in tier preset sync PR
export const createTierPreset = mutation({
  args: {
    name: v.string(),
    tiers: tierPresetTiersValidator,
  },
  handler: async (_ctx, _args) =>
  {
    throw new Error('not implemented: createTierPreset — presets sync PR')
  },
})

// update an existing preset's name or tier structure
// todo: implement in tier preset sync PR
export const updateTierPreset = mutation({
  args: {
    presetExternalId: v.string(),
    name: v.optional(v.string()),
    tiers: v.optional(tierPresetTiersValidator),
  },
  handler: async (_ctx, _args) =>
  {
    throw new Error('not implemented: updateTierPreset — presets sync PR')
  },
})

// delete a user-owned preset
// todo: implement in tier preset sync PR
export const deleteTierPreset = mutation({
  args: { presetExternalId: v.string() },
  handler: async (_ctx, _args) =>
  {
    throw new Error('not implemented: deleteTierPreset — presets sync PR')
  },
})
