// src/features/workspace/boards/lib/boardDefaults.ts
// canonical default board structure & board-level defaults

import type { Tier } from '@/features/workspace/boards/model/contract'
import type { TierId } from '@/shared/types/ids'
import type { PaletteId } from '@/shared/types/theme'
import { getAutoTierColorSpec } from '@/shared/theme/tierColors'

// default board title used on first load & for newly created boards
export const DEFAULT_TITLE = 'My Tier List'

// stable tier IDs for the default S–E rows (indexed by position)
export const DEFAULT_TIER_IDS: TierId[] = [
  'tier-s',
  'tier-a',
  'tier-b',
  'tier-c',
  'tier-d',
  'tier-e',
]

// display names for the default S–E rows
export const DEFAULT_TIER_NAMES = ['S', 'A', 'B', 'C', 'D', 'E']

// build a fresh set of default tiers w/ empty item lists
export const buildDefaultTiers = (paletteId: PaletteId = 'classic'): Tier[] =>
  DEFAULT_TIER_NAMES.map((_, index) => ({
    id:
      DEFAULT_TIER_IDS[index] ??
      (`tier-${(DEFAULT_TIER_NAMES[index] ?? `${index + 1}`).toLowerCase()}` as TierId),
    name: DEFAULT_TIER_NAMES[index] ?? `Tier ${index + 1}`,
    colorSpec: getAutoTierColorSpec(paletteId, index),
    itemIds: [],
  }))
