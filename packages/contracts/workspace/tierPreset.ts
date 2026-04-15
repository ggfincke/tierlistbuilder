// packages/contracts/workspace/tierPreset.ts
// * serializable tier-preset contract — reusable tier structure, independent of boards

import type { PresetId } from '../lib/ids'
import type { TierColorSpec } from '../lib/theme'

// tier structure within a reusable preset (no IDs or items)
export interface TierPresetTier
{
  name: string
  colorSpec: TierColorSpec
  // optional row background (palette or custom), matching the Tier contract
  rowColorSpec?: TierColorSpec
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
