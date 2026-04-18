import type {
  BoardSnapshot,
  Tier,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
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

export const makeItem = (overrides?: Partial<TierItem>): TierItem => ({
  id: overrides?.id ?? asItemId('item-1'),
  ...overrides,
})

// returns an empty BoardSnapshot — callers compose tiers/items via overrides.
// keeps the default minimal so each test reads as a focused scenario rather
// than fighting boilerplate from a richer baseline
export const makeBoardSnapshot = (
  overrides?: Partial<BoardSnapshot>
): BoardSnapshot => ({
  title: 'Test Board',
  tiers: [],
  unrankedItemIds: [],
  items: {},
  deletedItems: [],
  ...overrides,
})

// DOMRect-like for layout/popup tests. derives right/bottom from
// left/top/width/height when not explicitly overridden so callers can pass
// either pair without repeating math
export const makeRect = (overrides?: Partial<DOMRect>): DOMRect =>
{
  const top = overrides?.top ?? 0
  const left = overrides?.left ?? 0
  const width = overrides?.width ?? 0
  const height = overrides?.height ?? 0
  return {
    x: overrides?.x ?? left,
    y: overrides?.y ?? top,
    top,
    left,
    width,
    height,
    right: overrides?.right ?? left + width,
    bottom: overrides?.bottom ?? top + height,
    toJSON: () => ({}),
  } as DOMRect
}
