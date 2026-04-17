// src/features/workspace/tier-presets/data/cloud/tierPresetRepository.ts
// Convex adapters for cloud tier-preset sync. mirrors boardRepository's
// hook + *Imperative split — React uses hooks; sync layer uses imperative variants

import { useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import type { TierPresetCloudRow } from '@tierlistbuilder/contracts/workspace/cloudPreset'
import type { TierPresetTier } from '@tierlistbuilder/contracts/workspace/tierPreset'
import { convexClient } from '~/features/platform/backend/convexClient'

export const useListMyTierPresets = (
  enabled: boolean
): TierPresetCloudRow[] | undefined =>
  useQuery(
    api.workspace.tierPresets.queries.getMyTierPresets,
    enabled ? {} : 'skip'
  )

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

export const updateTierPresetImperative = (args: {
  presetExternalId: string
  name?: string
  tiers?: TierPresetTier[]
}): Promise<{ updatedAt: number }> =>
  convexClient.mutation(
    api.workspace.tierPresets.mutations.updateTierPreset,
    args
  )

export const deleteTierPresetImperative = (args: {
  presetExternalId: string
}): Promise<null> =>
  convexClient.mutation(
    api.workspace.tierPresets.mutations.deleteTierPreset,
    args
  )
