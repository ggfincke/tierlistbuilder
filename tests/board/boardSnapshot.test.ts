// tests/board/boardSnapshot.test.ts
// board snapshot creation, reset, & normalization invariants

import { describe, it, expect } from 'vitest'
import {
  createInitialBoardData,
  createNewTier,
  resetBoardData,
  normalizeBoardSnapshot,
} from '~/shared/board-data/boardSnapshot'
import {
  createCustomTierColorSpec,
  normalizeCanonicalTierColorSpec,
} from '~/shared/theme/tierColors'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import { makeBoardSnapshot, makeItem, makeTier } from '../fixtures'
import { asInvalid } from '../typeHelpers'

describe('createInitialBoardData', () =>
{
  it('creates a 6-tier board w/ default title & no items', () =>
  {
    const data = createInitialBoardData('classic')
    expect(data.title).toBe('My Tier List')
    expect(data.tiers.map((t) => t.name)).toEqual([
      'S',
      'A',
      'B',
      'C',
      'D',
      'E',
    ])
    expect(data.tiers.every((t) => t.itemIds.length === 0)).toBe(true)
    expect(data.items).toEqual({})
    expect(data.unrankedItemIds).toEqual([])
    expect(data.deletedItems).toEqual([])
  })
})

describe('resetBoardData', () =>
{
  it('moves all items to unranked, resets tiers, & preserves title', () =>
  {
    const state = makeBoardSnapshot({
      title: 'Custom Title',
      tiers: [
        makeTier({ id: 'tier-s', itemIds: [asItemId('a'), asItemId('b')] }),
        makeTier({ id: 'tier-a', itemIds: [asItemId('c')] }),
      ],
      unrankedItemIds: [asItemId('d')],
      items: {
        [asItemId('a')]: makeItem({ id: asItemId('a') }),
        [asItemId('b')]: makeItem({ id: asItemId('b') }),
        [asItemId('c')]: makeItem({ id: asItemId('c') }),
        [asItemId('d')]: makeItem({ id: asItemId('d') }),
      },
    })

    const result = resetBoardData(state, 'classic')
    expect(result.title).toBe('Custom Title')
    expect(result.tiers).toHaveLength(6)
    expect(result.unrankedItemIds).toEqual(['a', 'b', 'c', 'd'])
    expect(result.tiers.every((t) => t.itemIds.length === 0)).toBe(true)
  })
})

describe('normalizeBoardSnapshot', () =>
{
  it('returns valid defaults for null input', () =>
  {
    const data = normalizeBoardSnapshot(null, 'classic')
    expect(data.tiers).toHaveLength(6)
    expect(data.items).toEqual({})
  })

  it('preserves source image refs & drops identity transforms', () =>
  {
    const id = asItemId('item-image')
    const result = normalizeBoardSnapshot(
      makeBoardSnapshot({
        items: {
          [id]: makeItem({
            id,
            imageRef: { hash: 'thumb-hash' },
            sourceImageRef: { hash: 'source-hash' },
            transform: { rotation: 0, zoom: 1, offsetX: 0, offsetY: 0 },
          }),
        },
      }),
      'classic'
    )

    expect(result.items[id].sourceImageRef).toEqual({ hash: 'source-hash' })
    expect(result.items[id].transform).toBeUndefined()
  })

  it('falls back to auto palette color when a tier is missing its colorSpec', () =>
  {
    const result = normalizeBoardSnapshot(
      { tiers: asInvalid([{ id: 'tier-s', name: 'S', itemIds: [] }]) },
      'classic'
    )
    expect(result.tiers[0].colorSpec).toEqual({ kind: 'palette', index: 0 })
  })

  it('drops duplicate or dangling board-order refs while preserving live items', () =>
  {
    const itemA = asItemId('item-a')
    const itemB = asItemId('item-b')
    const itemC = asItemId('item-c')

    const result = normalizeBoardSnapshot(
      {
        tiers: asInvalid([
          {
            id: 'tier-s',
            name: 'S',
            colorSpec: { kind: 'palette', index: 0 },
            itemIds: [itemA, 'missing-item', itemB, itemA],
          },
          {
            id: 'tier-s',
            name: 'Duplicate',
            colorSpec: { kind: 'palette', index: 1 },
            itemIds: [itemB],
          },
        ]),
        unrankedItemIds: [itemC, itemA, 'missing-unranked'],
        items: {
          [itemA]: makeItem({ id: itemA }),
          [itemB]: makeItem({ id: itemB }),
          [itemC]: makeItem({ id: itemC }),
        },
      },
      'classic'
    )

    expect(result.tiers.map((tier) => tier.id)).toEqual(['tier-s', 'tier-a'])
    expect(result.tiers[0].itemIds).toEqual([itemA, itemB])
    expect(result.tiers[1].itemIds).toEqual([])
    expect(result.unrankedItemIds).toEqual([itemC])
    expect(Object.keys(result.items)).toEqual([itemA, itemB, itemC])
  })

  it('preserves a valid rowColorSpec & drops invalid input', () =>
  {
    const present = normalizeBoardSnapshot(
      makeBoardSnapshot({
        tiers: [
          makeTier({
            id: 'tier-s',
            rowColorSpec: createCustomTierColorSpec('#112233'),
          }),
        ],
      }),
      'classic'
    )
    expect(present.tiers[0].rowColorSpec).toEqual({
      kind: 'custom',
      hex: '#112233',
    })

    const invalid: Partial<BoardSnapshot> & { tiers: unknown[] } = {
      tiers: [
        {
          id: 'tier-s',
          name: 'S',
          colorSpec: { kind: 'palette', index: 0 },
          rowColorSpec: 'not a spec',
          itemIds: [],
        },
      ],
      unrankedItemIds: [],
      items: {},
      deletedItems: [],
    }
    const dropped = normalizeBoardSnapshot(
      invalid as Partial<BoardSnapshot>,
      'classic'
    )
    expect(dropped.tiers[0].rowColorSpec).toBeUndefined()
  })
})

describe('normalizeCanonicalTierColorSpec', () =>
{
  it('normalizes valid specs & rejects malformed input', () =>
  {
    expect(
      normalizeCanonicalTierColorSpec({ kind: 'palette', index: 3 })
    ).toEqual({
      kind: 'palette',
      index: 3,
    })
    expect(
      normalizeCanonicalTierColorSpec({ kind: 'custom', hex: '#FF0000' })
    ).toEqual({ kind: 'custom', hex: '#ff0000' })
    expect(
      normalizeCanonicalTierColorSpec({ kind: 'custom', hex: 'not-a-color' })
    ).toEqual({ kind: 'custom', hex: '#888888' })

    expect(normalizeCanonicalTierColorSpec(null)).toBeNull()
    expect(normalizeCanonicalTierColorSpec({ kind: 'palette' })).toBeNull()
    expect(normalizeCanonicalTierColorSpec({ kind: 'custom' })).toBeNull()
    expect(normalizeCanonicalTierColorSpec({ index: 0 })).toBeNull()
  })
})

describe('createNewTier', () =>
{
  it('produces tier-prefixed ID, 1-indexed name, & wrapping palette spec', () =>
  {
    expect(createNewTier('classic', 0).id).toMatch(/^tier-/)
    expect(createNewTier('classic', 0).name).toBe('Tier 1')
    expect(createNewTier('classic', 5).name).toBe('Tier 6')
    expect(createNewTier('classic', 2).colorSpec).toEqual({
      kind: 'palette',
      index: 2,
    })
    expect(createNewTier('classic', 100).colorSpec.kind).toBe('palette')
    expect(createNewTier('classic', 0).itemIds).toEqual([])
  })
})
