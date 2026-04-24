// src/features/workspace/tier-presets/model/tierPresets.ts
// board preset definitions & conversion helpers

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type {
  TierPreset,
  TierPresetTier,
} from '@tierlistbuilder/contracts/workspace/tierPreset'
import {
  generatePresetId,
  generateTierId,
} from '@tierlistbuilder/contracts/lib/ids'
import { DEFAULT_TITLE } from '~/features/workspace/boards/lib/boardDefaults'
import {
  createCustomTierColorSpec,
  createPaletteTierColorSpec,
} from '~/shared/theme/tierColors'

export const BUILTIN_PRESETS: TierPreset[] = [
  {
    id: 'builtin-classic',
    name: 'Classic (S-E)',
    builtIn: true,
    tiers: [
      { name: 'S', colorSpec: createPaletteTierColorSpec(0) },
      { name: 'A', colorSpec: createPaletteTierColorSpec(1) },
      { name: 'B', colorSpec: createPaletteTierColorSpec(2) },
      { name: 'C', colorSpec: createPaletteTierColorSpec(3) },
      { name: 'D', colorSpec: createPaletteTierColorSpec(4) },
      { name: 'E', colorSpec: createPaletteTierColorSpec(5) },
    ],
  },
  {
    id: 'builtin-top10',
    name: 'Top 10',
    builtIn: true,
    tiers: Array.from({ length: 10 }, (_, i) => ({
      name: `#${i + 1}`,
      colorSpec: createPaletteTierColorSpec(i),
    })),
  },
  {
    id: 'builtin-yes-no-maybe',
    name: 'Yes / No / Maybe',
    builtIn: true,
    tiers: [
      { name: 'Yes', colorSpec: createPaletteTierColorSpec(4) },
      { name: 'Maybe', colorSpec: createPaletteTierColorSpec(2) },
      { name: 'No', colorSpec: createPaletteTierColorSpec(0) },
    ],
  },
  {
    id: 'builtin-gold-silver-bronze',
    name: 'Gold / Silver / Bronze',
    builtIn: true,
    tiers: [
      { name: 'Gold', colorSpec: createCustomTierColorSpec('#ffd700') },
      { name: 'Silver', colorSpec: createCustomTierColorSpec('#c0c0c0') },
      { name: 'Bronze', colorSpec: createCustomTierColorSpec('#cd7f32') },
    ],
  },
  {
    id: 'builtin-abc',
    name: 'A / B / C',
    builtIn: true,
    tiers: [
      { name: 'A', colorSpec: createPaletteTierColorSpec(1) },
      { name: 'B', colorSpec: createPaletteTierColorSpec(2) },
      { name: 'C', colorSpec: createPaletteTierColorSpec(3) },
    ],
  },
  {
    id: 'builtin-love-hate',
    name: 'Love It / Hate It',
    builtIn: true,
    tiers: [
      { name: 'Love', colorSpec: createCustomTierColorSpec('#e74c8b') },
      { name: 'Like', colorSpec: createCustomTierColorSpec('#f59e42') },
      { name: 'Meh', colorSpec: createPaletteTierColorSpec(3) },
      { name: 'Dislike', colorSpec: createCustomTierColorSpec('#6b7280') },
      { name: 'Hate', colorSpec: createCustomTierColorSpec('#374151') },
    ],
  },
  {
    id: 'builtin-top5',
    name: 'Top 5',
    builtIn: true,
    tiers: Array.from({ length: 5 }, (_, i) => ({
      name: `#${i + 1}`,
      colorSpec: createPaletteTierColorSpec(i),
    })),
  },
  ]

// convert a preset into fresh board data w/ generated tier IDs
export const createBoardDataFromPreset = (
  preset: TierPreset,
  title = DEFAULT_TITLE
): BoardSnapshot => ({
  title,
  tiers: preset.tiers.map((t) =>
  {
    const tier: BoardSnapshot['tiers'][number] = {
      id: generateTierId(),
      name: t.name,
      description: t.description,
      colorSpec: t.colorSpec,
      itemIds: [],
    }
    if (t.rowColorSpec) tier.rowColorSpec = t.rowColorSpec
    return tier
  }),
  unrankedItemIds: [],
  items: {},
  deletedItems: [],
})

// extract a preset from existing board data (strips items, keeps structure)
export const extractPresetFromBoard = (
  data: BoardSnapshot,
  name: string
): TierPreset => ({
  id: generatePresetId(),
  name,
  builtIn: false,
  tiers: data.tiers.map((tier) =>
  {
    const presetTier: TierPresetTier = {
      name: tier.name,
      colorSpec: tier.colorSpec,
      description: tier.description,
    }
    if (tier.rowColorSpec) presetTier.rowColorSpec = tier.rowColorSpec
    return presetTier
  }),
})
