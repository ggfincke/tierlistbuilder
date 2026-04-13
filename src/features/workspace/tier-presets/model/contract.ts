// src/features/workspace/tier-presets/model/contract.ts
// * serializable tier-preset contract — reusable tier structure stored locally, independent of boards

import type { PresetId } from '@/shared/types/ids'
import type { TierColorSpec } from '@/shared/types/theme'

// tier structure within a reusable preset (no IDs or items)
export interface TierPresetTier
{
  name: string
  colorSpec: TierColorSpec
  description?: string
}

// reusable board preset — defines tier structure w/o items
export interface TierPreset
{
  id: PresetId
  name: string
  builtIn: boolean
  tiers: TierPresetTier[]
}
