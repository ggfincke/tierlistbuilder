// convex/workspace/tierPresets/mutations.ts
// tier preset mutations: create & delete owned presets. callers supply
// a pre-generated externalId so local PresetId & cloud externalId stay in sync

import { v } from 'convex/values'
import { mutation } from '../../_generated/server'
import {
  normalizeTierPresetName,
  PRESET_NAME_FALLBACK,
} from '@tierlistbuilder/contracts/workspace/tierPreset'
import { requireCurrentUserId } from '../../lib/auth'
import { findOwnedTierPresetByExternalId } from '../../lib/permissions'
import { tierPresetTiersValidator } from '../../lib/validators/common'
import { isUserPresetId } from '@tierlistbuilder/contracts/lib/ids'
import { assertExternalIdShape } from '../../lib/assertions'

// canonical preset externalId guard — must start w/ 'preset-' (client factory
// generatePresetId). blocks a malicious client from shadowing a 'builtin-*'
// or some other prefix family
const validatePresetExternalId = (externalId: string): void =>
{
  assertExternalIdShape(
    'presetExternalId',
    externalId,
    isUserPresetId,
    'preset-'
  )
}

// create a new preset; idempotent — if a row w/ this externalId already exists
// & the caller owns it, patch instead of insert
export const createTierPreset = mutation({
  args: {
    externalId: v.string(),
    name: v.string(),
    tiers: tierPresetTiersValidator,
  },
  returns: v.object({ updatedAt: v.number() }),
  handler: async (ctx, args): Promise<{ updatedAt: number }> =>
  {
    const userId = await requireCurrentUserId(ctx)
    validatePresetExternalId(args.externalId)
    const now = Date.now()
    const name = normalizeTierPresetName(args.name) || PRESET_NAME_FALLBACK

    const existing = await findOwnedTierPresetByExternalId(
      ctx,
      args.externalId,
      userId
    )

    if (existing)
    {
      await ctx.db.patch(existing._id, {
        name,
        tiers: args.tiers,
        updatedAt: now,
      })
      return { updatedAt: now }
    }

    await ctx.db.insert('tierPresets', {
      externalId: args.externalId,
      ownerId: userId,
      name,
      tiers: args.tiers,
      createdAt: now,
      updatedAt: now,
    })

    return { updatedAt: now }
  },
})

// delete an owned preset. no soft-delete (cosmetic data, no restore UX).
// idempotent — deleting a non-existent preset is a no-op so retries don't error
export const deleteTierPreset = mutation({
  args: { presetExternalId: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    validatePresetExternalId(args.presetExternalId)
    const preset = await findOwnedTierPresetByExternalId(
      ctx,
      args.presetExternalId,
      userId
    )

    if (!preset)
    {
      return null
    }

    await ctx.db.delete(preset._id)
    return null
  },
})
