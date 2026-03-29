// src/domain/templates.ts
// board template definitions & conversion helpers

import type { TierListData, TierTemplate } from '../types'
import { DEFAULT_TITLE } from '../utils/constants'
import {
  createCustomTierColorSpec,
  createPaletteTierColorSpec,
} from './tierColors'

export const BUILTIN_TEMPLATES: TierTemplate[] = [
  {
    id: 'builtin-classic',
    name: 'Classic (S-E)',
    builtIn: true,
    tiers: [
      { name: 'S', colorSpec: createPaletteTierColorSpec('default', 0) },
      { name: 'A', colorSpec: createPaletteTierColorSpec('default', 1) },
      { name: 'B', colorSpec: createPaletteTierColorSpec('default', 2) },
      { name: 'C', colorSpec: createPaletteTierColorSpec('default', 3) },
      { name: 'D', colorSpec: createPaletteTierColorSpec('default', 4) },
      { name: 'E', colorSpec: createPaletteTierColorSpec('default', 5) },
    ],
  },
  {
    id: 'builtin-top10',
    name: 'Top 10',
    builtIn: true,
    tiers: Array.from({ length: 10 }, (_, i) => ({
      name: `#${i + 1}`,
      colorSpec: createPaletteTierColorSpec('preset', i % 15),
    })),
  },
  {
    id: 'builtin-yes-no-maybe',
    name: 'Yes / No / Maybe',
    builtIn: true,
    tiers: [
      { name: 'Yes', colorSpec: createPaletteTierColorSpec('default', 4) },
      { name: 'Maybe', colorSpec: createPaletteTierColorSpec('default', 2) },
      { name: 'No', colorSpec: createPaletteTierColorSpec('default', 0) },
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
      { name: 'A', colorSpec: createPaletteTierColorSpec('default', 1) },
      { name: 'B', colorSpec: createPaletteTierColorSpec('default', 2) },
      { name: 'C', colorSpec: createPaletteTierColorSpec('default', 3) },
    ],
  },
  {
    id: 'builtin-love-hate',
    name: 'Love It / Hate It',
    builtIn: true,
    tiers: [
      { name: 'Love', colorSpec: createCustomTierColorSpec('#e74c8b') },
      { name: 'Like', colorSpec: createCustomTierColorSpec('#f59e42') },
      { name: 'Meh', colorSpec: createPaletteTierColorSpec('default', 3) },
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
      colorSpec: createPaletteTierColorSpec('preset', i % 15),
    })),
  },
]

// convert a template into fresh board data w/ generated tier IDs
export const createBoardDataFromTemplate = (
  template: TierTemplate,
  title = DEFAULT_TITLE
): TierListData => ({
  title,
  tiers: template.tiers.map((t) => ({
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

// extract a template from existing board data (strips items, keeps structure)
export const extractTemplateFromBoard = (
  data: TierListData,
  name: string
): TierTemplate => ({
  id: `template-${crypto.randomUUID()}`,
  name,
  builtIn: false,
  tiers: data.tiers.map((tier) => ({
    name: tier.name,
    colorSpec: tier.colorSpec,
    description: tier.description,
  })),
})
