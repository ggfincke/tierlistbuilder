// packages/contracts/workspace/tierPreset.ts
// serializable tier-preset contract — reusable tier structure, independent of boards

import type { PresetId } from '../lib/ids'
import type { TierColorSpec } from '../lib/theme'
import { normalizeStringInput } from '../lib/strings'

// hard cap for user-supplied preset names — same shape as MAX_BOARD_TITLE_LENGTH
const MAX_TIER_PRESET_NAME_LENGTH = 80

// fallback name used when a preset is created or renamed w/ an empty string
export const PRESET_NAME_FALLBACK = 'Untitled preset'

// trim & length-cap a user-supplied preset name; empty input returns ''
// so callers can decide whether to substitute the fallback (mutation paths
// do; UI rename inputs may want to reject the empty save instead)
export const normalizeTierPresetName = (raw: string): string =>
  normalizeStringInput(raw, MAX_TIER_PRESET_NAME_LENGTH)

// tier structure within a reusable preset (no IDs or items)
export interface TierPresetTier
{
  name: string
  colorSpec: TierColorSpec
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

// built-in presets shipped w/ the app — single source of truth for frontend & seed
export const BUILTIN_PRESETS: TierPreset[] = [
  {
    id: 'builtin-classic',
    name: 'Classic (S-E)',
    builtIn: true,
    tiers: [
      { name: 'S', colorSpec: { kind: 'palette', index: 0 } },
      { name: 'A', colorSpec: { kind: 'palette', index: 1 } },
      { name: 'B', colorSpec: { kind: 'palette', index: 2 } },
      { name: 'C', colorSpec: { kind: 'palette', index: 3 } },
      { name: 'D', colorSpec: { kind: 'palette', index: 4 } },
      { name: 'E', colorSpec: { kind: 'palette', index: 5 } },
    ],
  },
  {
    id: 'builtin-top10',
    name: 'Top 10',
    builtIn: true,
    tiers: Array.from({ length: 10 }, (_, i) => ({
      name: `#${i + 1}`,
      colorSpec: { kind: 'palette', index: i },
    })),
  },
  {
    id: 'builtin-yes-no-maybe',
    name: 'Yes / No / Maybe',
    builtIn: true,
    tiers: [
      { name: 'Yes', colorSpec: { kind: 'palette', index: 4 } },
      { name: 'Maybe', colorSpec: { kind: 'palette', index: 2 } },
      { name: 'No', colorSpec: { kind: 'palette', index: 0 } },
    ],
  },
  {
    id: 'builtin-gold-silver-bronze',
    name: 'Gold / Silver / Bronze',
    builtIn: true,
    tiers: [
      { name: 'Gold', colorSpec: { kind: 'custom', hex: '#ffd700' } },
      { name: 'Silver', colorSpec: { kind: 'custom', hex: '#c0c0c0' } },
      { name: 'Bronze', colorSpec: { kind: 'custom', hex: '#cd7f32' } },
    ],
  },
  {
    id: 'builtin-abc',
    name: 'A / B / C',
    builtIn: true,
    tiers: [
      { name: 'A', colorSpec: { kind: 'palette', index: 1 } },
      { name: 'B', colorSpec: { kind: 'palette', index: 2 } },
      { name: 'C', colorSpec: { kind: 'palette', index: 3 } },
    ],
  },
  {
    id: 'builtin-love-hate',
    name: 'Love It / Hate It',
    builtIn: true,
    tiers: [
      { name: 'Love', colorSpec: { kind: 'custom', hex: '#e74c8b' } },
      { name: 'Like', colorSpec: { kind: 'custom', hex: '#f59e42' } },
      { name: 'Meh', colorSpec: { kind: 'palette', index: 3 } },
      { name: 'Dislike', colorSpec: { kind: 'custom', hex: '#6b7280' } },
      { name: 'Hate', colorSpec: { kind: 'custom', hex: '#374151' } },
    ],
  },
  {
    id: 'builtin-top5',
    name: 'Top 5',
    builtIn: true,
    tiers: Array.from({ length: 5 }, (_, i) => ({
      name: `#${i + 1}`,
      colorSpec: { kind: 'palette', index: i },
    })),
  },
]
