// packages/contracts/workspace/tierPreset.ts
// * serializable tier-preset contract — reusable tier structure, independent of boards

import type { PresetId } from '../lib/ids'
import type { TierColorSpec } from '../lib/theme'

// hard cap for user-supplied preset names — same shape as MAX_BOARD_TITLE_LENGTH
export const MAX_TIER_PRESET_NAME_LENGTH = 80

// fallback name used when a preset is created or renamed w/ an empty string
export const PRESET_NAME_FALLBACK = 'Untitled preset'

// trim & length-cap a user-supplied preset name; empty input returns ''
// so callers can decide whether to substitute the fallback (mutation paths
// do; UI rename inputs may want to reject the empty save instead)
export const normalizeTierPresetName = (raw: string): string =>
{
  const trimmed = raw.trim()
  if (!trimmed)
  {
    return ''
  }

  return trimmed.length > MAX_TIER_PRESET_NAME_LENGTH
    ? trimmed.slice(0, MAX_TIER_PRESET_NAME_LENGTH)
    : trimmed
}

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
