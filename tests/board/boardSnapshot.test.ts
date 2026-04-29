// tests/board/boardSnapshot.test.ts
// board snapshot creation & normalization helpers

import { describe, it, expect } from 'vitest'
import {
  createInitialBoardData,
  createNewTier,
  resetBoardData,
  normalizeBoardSnapshot,
} from '~/features/workspace/boards/model/boardSnapshot'
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
  it('creates a board w/ default title, 6 empty tiers, & no items', () =>
  {
    const data = createInitialBoardData('classic')
    expect(data.title).toBe('My Tier List')
    expect(data.tiers).toHaveLength(6)
    expect(data.tiers.map((t) => t.name)).toEqual([
      'S',
      'A',
      'B',
      'C',
      'D',
      'E',
    ])
    for (const tier of data.tiers)
    {
      expect(tier.itemIds).toEqual([])
    }
    expect(data.items).toEqual({})
    expect(data.deletedItems).toEqual([])
    expect(data.unrankedItemIds).toEqual([])
  })
})

describe('resetBoardData', () =>
{
  it('moves all items to unranked, resets tiers, & preserves title', () =>
  {
    const state = makeBoardSnapshot({
      title: 'Custom Title',
      tiers: [
        makeTier({
          id: 'tier-s',
          name: 'S',
          colorSpec: { kind: 'custom', hex: '#ff0000' },
          itemIds: [asItemId('a'), asItemId('b')],
        }),
        makeTier({
          id: 'tier-a',
          name: 'A',
          colorSpec: { kind: 'custom', hex: '#00ff00' },
          itemIds: [asItemId('c')],
        }),
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
    for (const tier of result.tiers)
    {
      expect(tier.itemIds).toEqual([])
    }
  })
})

describe('normalizeBoardSnapshot', () =>
{
  it('returns valid defaults for null input', () =>
  {
    const data = normalizeBoardSnapshot(null, 'classic')
    expect(data.title).toBe('My Tier List')
    expect(data.tiers).toHaveLength(6)
    expect(data.items).toEqual({})
  })

  it('passes through valid modern data unchanged', () =>
  {
    const input = createInitialBoardData('classic')
    input.title = 'Test Board'
    const result = normalizeBoardSnapshot(input, 'classic')
    expect(result.title).toBe('Test Board')
    expect(result.tiers).toHaveLength(6)
    for (const [i, tier] of result.tiers.entries())
    {
      expect(tier.colorSpec).toEqual({
        kind: 'palette',
        index: i,
      })
    }
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

  it('preserves explicit per-item Auto label color', () =>
  {
    const id = asItemId('item-auto-label')
    const result = normalizeBoardSnapshot(
      makeBoardSnapshot({
        items: {
          [id]: makeItem({
            id,
            labelOptions: { textColor: 'auto' },
          }),
        },
      }),
      'classic'
    )

    expect(result.items[id].labelOptions).toEqual({ textColor: 'auto' })
  })

  it('falls back to auto palette color when a tier is missing its colorSpec', () =>
  {
    const rawTiers = [
      {
        id: 'tier-s',
        name: 'S',
        itemIds: [],
      },
    ]
    const result = normalizeBoardSnapshot(
      { tiers: asInvalid(rawTiers) },
      'classic'
    )
    expect(result.tiers[0].colorSpec).toEqual({
      kind: 'palette',
      index: 0,
    })
  })

  it('preserves a valid rowColorSpec & drops invalid input', () =>
  {
    const present = normalizeBoardSnapshot(
      makeBoardSnapshot({
        tiers: [
          makeTier({
            id: 'tier-s',
            name: 'S',
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
  it('normalizes a valid palette colorSpec', () =>
  {
    expect(
      normalizeCanonicalTierColorSpec({ kind: 'palette', index: 3 })
    ).toEqual({ kind: 'palette', index: 3 })
  })

  it('normalizes a valid custom colorSpec', () =>
  {
    expect(
      normalizeCanonicalTierColorSpec({ kind: 'custom', hex: '#FF0000' })
    ).toEqual({ kind: 'custom', hex: '#ff0000' })
  })

  it('returns null for non-spec inputs (nullish, primitives, missing kind)', () =>
  {
    expect(normalizeCanonicalTierColorSpec(null)).toBeNull()
    expect(normalizeCanonicalTierColorSpec(undefined)).toBeNull()
    expect(normalizeCanonicalTierColorSpec('palette')).toBeNull()
    expect(normalizeCanonicalTierColorSpec(42)).toBeNull()
    expect(normalizeCanonicalTierColorSpec(true)).toBeNull()
    expect(normalizeCanonicalTierColorSpec({ index: 0 })).toBeNull()
  })

  it('returns null for valid-kind specs missing required fields', () =>
  {
    expect(normalizeCanonicalTierColorSpec({ kind: 'palette' })).toBeNull()
    expect(normalizeCanonicalTierColorSpec({ kind: 'custom' })).toBeNull()
  })

  it('falls back to #888888 for custom spec w/ invalid hex', () =>
  {
    expect(
      normalizeCanonicalTierColorSpec({ kind: 'custom', hex: 'not-a-color' })
    ).toEqual({ kind: 'custom', hex: '#888888' })
  })
})

describe('createNewTier', () =>
{
  it('generates a tier ID w/ the tier- prefix', () =>
  {
    const tier = createNewTier('classic', 0)
    expect(tier.id).toMatch(/^tier-/)
  })

  it('names the tier based on the count (1-indexed)', () =>
  {
    expect(createNewTier('classic', 0).name).toBe('Tier 1')
    expect(createNewTier('classic', 5).name).toBe('Tier 6')
    expect(createNewTier('classic', 12).name).toBe('Tier 13')
  })

  it('assigns a palette color based on the tier count', () =>
  {
    const tier = createNewTier('classic', 2)
    expect(tier.colorSpec).toEqual({ kind: 'palette', index: 2 })
  })

  it('wraps palette color when tier count exceeds palette size', () =>
  {
    // classic palette has a finite number of swatches — ensure wrapping works
    const tier = createNewTier('classic', 100)
    expect(tier.colorSpec.kind).toBe('palette')
  })

  it('starts w/ an empty itemIds array', () =>
  {
    expect(createNewTier('classic', 0).itemIds).toEqual([])
  })
})
