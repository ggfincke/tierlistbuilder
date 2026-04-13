import type { Tier } from '@/features/workspace/boards/model/contract'
import type { ContainerSnapshot } from '@/features/workspace/boards/model/runtime'
import { createPaletteTierColorSpec } from '@/shared/theme/tierColors'

export const TIER_IDS = ['tier-s', 'tier-a', 'tier-b'] as const
export const ITEM_IDS = [
  'item-1',
  'item-2',
  'item-3',
  'item-4',
  'item-5',
  'item-6',
  'item-7',
  'item-8',
] as const

export const makeSnapshot = (
  overrides?: Partial<ContainerSnapshot>
): ContainerSnapshot => ({
  tiers: [
    { id: 'tier-s', itemIds: ['item-1', 'item-2', 'item-3'] },
    { id: 'tier-a', itemIds: ['item-4', 'item-5'] },
    { id: 'tier-b', itemIds: [] },
  ],
  unrankedItemIds: ['item-6', 'item-7', 'item-8'],
  ...overrides,
})

export const makeTier = (overrides?: Partial<Tier>): Tier => ({
  id: 'tier-s',
  name: 'S',
  colorSpec: createPaletteTierColorSpec(0),
  itemIds: [],
  ...overrides,
})
