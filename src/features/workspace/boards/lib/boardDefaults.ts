// src/features/workspace/boards/lib/boardDefaults.ts
// canonical default board structure & board-level defaults

import {
  DEFAULT_BOARD_TITLE,
  type Tier,
} from '@tierlistbuilder/contracts/workspace/board'
import { asTierId, type TierId } from '@tierlistbuilder/contracts/lib/ids'
import type { PaletteId } from '@tierlistbuilder/contracts/lib/theme'
import { getAutoTierColorSpec } from '~/shared/theme/tierColors'

// default board title used on first load & for newly created boards
export const DEFAULT_TITLE = DEFAULT_BOARD_TITLE

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
      asTierId(
        `tier-${(DEFAULT_TIER_NAMES[index] ?? `${index + 1}`).toLowerCase()}`
      ),
    name: DEFAULT_TIER_NAMES[index] ?? `Tier ${index + 1}`,
    colorSpec: getAutoTierColorSpec(paletteId, index),
    itemIds: [],
  }))
