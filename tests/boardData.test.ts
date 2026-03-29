import { describe, it, expect } from 'vitest'
import {
  createInitialBoardData,
  resetBoardData,
  normalizeTierListData,
} from '../src/domain/boardData'

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
    const state = {
      title: 'Custom Title',
      tiers: [
        {
          id: 'tier-s',
          name: 'S',
          colorSpec: { kind: 'custom' as const, hex: '#ff0000' },
          itemIds: ['a', 'b'],
        },
        {
          id: 'tier-a',
          name: 'A',
          colorSpec: { kind: 'custom' as const, hex: '#00ff00' },
          itemIds: ['c'],
        },
      ],
      unrankedItemIds: ['d'],
      items: {
        a: { id: 'a' },
        b: { id: 'b' },
        c: { id: 'c' },
        d: { id: 'd' },
      },
      deletedItems: [],
    }

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

describe('normalizeTierListData', () =>
{
  it('returns valid defaults for null input', () =>
  {
    const data = normalizeTierListData(null, 'classic')
    expect(data.title).toBe('My Tier List')
    expect(data.tiers).toHaveLength(6)
    expect(data.items).toEqual({})
  })

  it('passes through valid modern data unchanged', () =>
  {
    const input = createInitialBoardData('classic')
    input.title = 'Test Board'
    const result = normalizeTierListData(input, 'classic')
    expect(result.title).toBe('Test Board')
    expect(result.tiers).toHaveLength(6)
    for (const [i, tier] of result.tiers.entries())
    {
      expect(tier.colorSpec).toEqual({
        kind: 'palette',
        paletteType: 'default',
        index: i,
      })
    }
  })

  it('migrates legacy colorSource field to palette colorSpec', () =>
  {
    const legacyTiers = [
      {
        id: 'tier-s',
        name: 'S',
        colorSource: { paletteType: 'default', index: 0 },
        itemIds: [],
      },
    ]
    const result = normalizeTierListData(
      { tiers: legacyTiers as never },
      'classic'
    )
    expect(result.tiers[0].colorSpec).toEqual({
      kind: 'palette',
      paletteType: 'default',
      index: 0,
    })
  })

  it('migrates legacy raw color string to custom colorSpec', () =>
  {
    const legacyTiers = [
      {
        id: 'custom-tier',
        name: 'Custom',
        color: '#abcdef',
        itemIds: [],
      },
    ]
    const result = normalizeTierListData(
      { tiers: legacyTiers as never },
      'classic'
    )
    expect(result.tiers[0].colorSpec).toEqual({
      kind: 'custom',
      hex: '#abcdef',
    })
  })
})
