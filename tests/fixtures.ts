import type { Tier } from '@tierlistbuilder/contracts/workspace/board'
import type { ContainerSnapshot } from '~/features/workspace/boards/model/runtime'
import { createPaletteTierColorSpec } from '~/shared/theme/tierColors'
import { asItemId, type ItemId } from '@tierlistbuilder/contracts/lib/ids'

export const TIER_IDS = ['tier-s', 'tier-a', 'tier-b'] as const
export const ITEM_IDS: readonly ItemId[] = [
  asItemId('item-1'),
  asItemId('item-2'),
  asItemId('item-3'),
  asItemId('item-4'),
  asItemId('item-5'),
  asItemId('item-6'),
  asItemId('item-7'),
  asItemId('item-8'),
] as const

export const makeSnapshot = (
  overrides?: Partial<ContainerSnapshot>
): ContainerSnapshot => ({
  tiers: [
    {
      id: 'tier-s',
      itemIds: [asItemId('item-1'), asItemId('item-2'), asItemId('item-3')],
    },
    { id: 'tier-a', itemIds: [asItemId('item-4'), asItemId('item-5')] },
    { id: 'tier-b', itemIds: [] },
  ],
  unrankedItemIds: [asItemId('item-6'), asItemId('item-7'), asItemId('item-8')],
  ...overrides,
})

export const makeTier = (overrides?: Partial<Tier>): Tier => ({
  id: 'tier-s',
  name: 'S',
  colorSpec: createPaletteTierColorSpec(0),
  itemIds: [],
  ...overrides,
})
