// convex/workspace/tierPresets/mutations.ts
// tier preset mutations — create, update, delete owned presets. callers supply
// a pre-generated externalId so local PresetId & cloud externalId stay in sync

import { v } from 'convex/values'
import { mutation } from '../../_generated/server'
import {
  normalizeTierPresetName,
  PRESET_NAME_FALLBACK,
} from '@tierlistbuilder/contracts/workspace/tierPreset'
import { requireCurrentUserId } from '../../lib/auth'
import {
  findOwnedTierPresetByExternalId,
  requireTierPresetOwnershipByExternalId,
} from '../../lib/permissions'
import { tierPresetTiersValidator } from '../../lib/validators'

// create a new preset; idempotent — if a row w/ this externalId already exists
// & the caller owns it, patch instead of insert
export const createTierPreset = mutation({
  args: {
    externalId: v.string(),
    name: v.string(),
    tiers: tierPresetTiersValidator,
  },
  handler: async (ctx, args): Promise<{ updatedAt: number }> =>
  {
    const userId = await requireCurrentUserId(ctx)
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

// update an existing preset's name &/or tier structure. partial — fields
// the caller omits stay at their current value
export const updateTierPreset = mutation({
  args: {
    presetExternalId: v.string(),
    name: v.optional(v.string()),
    tiers: v.optional(tierPresetTiersValidator),
  },
  handler: async (ctx, args): Promise<{ updatedAt: number }> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const preset = await requireTierPresetOwnershipByExternalId(
      ctx,
      args.presetExternalId,
      userId
    )

    const patch: {
      name?: string
      tiers?: typeof preset.tiers
      updatedAt: number
    } = {
      updatedAt: Date.now(),
    }
    if (args.name !== undefined)
    {
      patch.name = normalizeTierPresetName(args.name) || PRESET_NAME_FALLBACK
    }
    if (args.tiers !== undefined)
    {
      patch.tiers = args.tiers
    }

    await ctx.db.patch(preset._id, patch)
    return { updatedAt: patch.updatedAt }
  },
})

// delete an owned preset. no soft-delete (cosmetic data, no restore UX).
// idempotent — deleting a non-existent preset is a no-op so retries don't error
export const deleteTierPreset = mutation({
  args: { presetExternalId: v.string() },
  handler: async (ctx, args): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
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
