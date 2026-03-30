// src/domain/presets.ts
// board preset definitions & conversion helpers

import type { TierListData, TierPreset } from '../types'
import { DEFAULT_TITLE } from '../utils/constants'
import {
  createCustomTierColorSpec,
  createPaletteTierColorSpec,
} from './tierColors'

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
): TierListData => ({
  title,
  tiers: preset.tiers.map((t) => ({
    id: `tier-${crypto.randomUUID()}`,
    name: t.name,
    description: t.description,
    colorSpec: t.colorSpec,
    itemIds: [],
  })),
  unrankedItemIds: [],
  items: {},
  deletedItems: [],
})

// extract a preset from existing board data (strips items, keeps structure)
export const extractPresetFromBoard = (
  data: TierListData,
  name: string
): TierPreset => ({
  id: `preset-${crypto.randomUUID()}`,
  name,
  builtIn: false,
  tiers: data.tiers.map((tier) => ({
    name: tier.name,
    colorSpec: tier.colorSpec,
    description: tier.description,
  })),
})
