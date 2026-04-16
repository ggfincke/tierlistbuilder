// packages/contracts/workspace/cloudPreset.ts
// wire contract for cloud-stored tier presets — what getMyTierPresets returns
// & what create/update mutations accept. mirrors the on-disk row shape but
// excludes server-private fields (_id, ownerId)

import type { TierPresetTier } from './tierPreset'

export interface TierPresetCloudRow
{
  externalId: string
  name: string
  tiers: TierPresetTier[]
  createdAt: number
  updatedAt: number
}
