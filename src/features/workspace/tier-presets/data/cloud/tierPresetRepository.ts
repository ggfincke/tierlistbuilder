// src/features/workspace/tier-presets/data/cloud/tierPresetRepository.ts
// imperative Convex adapters for cloud tier-preset sync — all callers live in
// the sync lifecycle layer, so no React hook wrappers are exposed

import { api } from '@convex/_generated/api'
import type { TierPresetCloudRow } from '@tierlistbuilder/contracts/workspace/cloudPreset'
import type { TierPresetTier } from '@tierlistbuilder/contracts/workspace/tierPreset'
import { convexClient } from '~/features/platform/convex/convexClient'

export const listMyTierPresetsImperative = (): Promise<TierPresetCloudRow[]> =>
  convexClient.query(api.workspace.tierPresets.queries.getMyTierPresets, {})

// idempotent on the server side: posting the same externalId twice patches
// the existing row instead of erroring. lets the resume helper safely retry
// after a partial failure
export const createTierPresetImperative = (args: {
  externalId: string
  name: string
  tiers: TierPresetTier[]
}): Promise<{ updatedAt: number }> =>
  convexClient.mutation(
    api.workspace.tierPresets.mutations.createTierPreset,
    args
  )

export const deleteTierPresetImperative = (args: {
  presetExternalId: string
}): Promise<null> =>
  convexClient.mutation(
    api.workspace.tierPresets.mutations.deleteTierPreset,
    args
  )
