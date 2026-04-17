// packages/contracts/workspace/cloudPreset.ts
// wire contract for cloud-stored tier presets — returned by getMyTierPresets &
// accepted by create/update mutations. excludes server-private fields (_id, ownerId)

import type { TierPresetTier } from './tierPreset'

export interface TierPresetCloudRow
{
  externalId: string
  name: string
  tiers: TierPresetTier[]
  createdAt: number
  updatedAt: number
}
