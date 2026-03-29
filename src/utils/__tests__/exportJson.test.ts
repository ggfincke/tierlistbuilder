// src/utils/__tests__/exportJson.test.ts
// unit tests for JSON board import parsing & validation

import { describe, expect, it } from 'vitest'

import type { TierListData } from '../../types'
import { parseBoardJson, parseBoardsJson } from '../exportJson'

const validBoard: TierListData = {
  title: 'Test Board',
  tiers: [
    {
      id: 'tier-s',
      name: 'S',
      color: '#ff0000',
      colorSource: { paletteType: 'default', index: 0 },
      itemIds: ['item-1'],
    },
  ],
  unrankedItemIds: ['item-2'],
  items: {
    'item-1': { id: 'item-1', label: 'Alpha' },
    'item-2': { id: 'item-2', label: 'Beta' },
  },
  deletedItems: [],
}

describe('parseBoardJson', () =>
{
  it('throws on invalid JSON syntax', () =>
  {
    expect(() => parseBoardJson('{')).toThrow('Invalid JSON file.')
  })

  it('throws on non-object values', () =>
  {
    expect(() => parseBoardJson('42')).toThrow('Invalid tier list format.')
    expect(() => parseBoardJson('"string"')).toThrow(
      'Invalid tier list format.'
    )
    expect(() => parseBoardJson('[1,2,3]')).toThrow('Invalid tier list format.')
    expect(() => parseBoardJson('null')).toThrow('Invalid tier list format.')
  })

  it('throws when tiers are missing or empty', () =>
  {
    expect(() => parseBoardJson(JSON.stringify({}))).toThrow(
      'File must contain at least one tier.'
    )
    expect(() => parseBoardJson(JSON.stringify({ tiers: [] }))).toThrow(
      'File must contain at least one tier.'
    )
  })

  it('throws on invalid tier structure', () =>
  {
    const data = {
      tiers: [{ id: 'tier-s', name: 'S' }],
      items: {},
    }
    expect(() => parseBoardJson(JSON.stringify(data))).toThrow(
      'Invalid tier structure'
    )
  })

  it('throws when items map is missing', () =>
  {
    const data = {
      tiers: [{ id: 'tier-s', name: 'S', color: '#ff0000', itemIds: [] }],
    }
    expect(() => parseBoardJson(JSON.stringify(data))).toThrow(
      'Missing items map.'
    )
  })

  it('throws when a referenced item is not in the items map', () =>
  {
    const data = {
      tiers: [
        {
          id: 'tier-s',
          name: 'S',
          color: '#ff0000',
          itemIds: ['missing-item'],
        },
      ],
      items: {},
    }
    expect(() => parseBoardJson(JSON.stringify(data))).toThrow(
      'Referenced item "missing-item" not found in items map.'
    )
  })

  it('parses valid raw TierListData', () =>
  {
    const result = parseBoardJson(JSON.stringify(validBoard))
    expect(result.title).toBe('Test Board')
    expect(result.tiers).toHaveLength(1)
    expect(result.tiers[0].id).toBe('tier-s')
    expect(result.unrankedItemIds).toEqual(['item-2'])
    expect(result.items['item-1'].label).toBe('Alpha')
  })

  it('unwraps { version, data } envelope format', () =>
  {
    const wrapped = {
      version: 1,
      exportedAt: '2026-03-28T00:00:00.000Z',
      data: validBoard,
    }
    const result = parseBoardJson(JSON.stringify(wrapped))
    expect(result.title).toBe('Test Board')
    expect(result.tiers).toHaveLength(1)
  })

  it('defaults missing optional fields', () =>
  {
    const minimal = {
      tiers: [
        {
          id: 'tier-s',
          name: 'S',
          color: '#ff0000',
          itemIds: [],
        },
      ],
      items: {},
    }
    const result = parseBoardJson(JSON.stringify(minimal))
    expect(result.title).toBe('Imported Tier List')
    expect(result.unrankedItemIds).toEqual([])
    expect(result.deletedItems).toEqual([])
  })

  it('normalizes missing colorSource to null', () =>
  {
    const data = {
      tiers: [
        {
          id: 'tier-s',
          name: 'S',
          color: '#ff0000',
          itemIds: [],
        },
      ],
      items: {},
    }
    const result = parseBoardJson(JSON.stringify(data))
    expect(result.tiers[0].colorSource).toBeNull()
  })

  it('round-trips valid board data', () =>
  {
    const json = JSON.stringify(validBoard)
    const result = parseBoardJson(json)
    expect(result).toEqual(validBoard)
  })
})

describe('parseBoardsJson', () =>
{
  it('wraps a single-board payload in an array', () =>
  {
    expect(parseBoardsJson(JSON.stringify(validBoard))).toEqual([validBoard])
  })

  it('parses a multi-board export envelope', () =>
  {
    const payload = {
      version: 1,
      exportedAt: '2026-03-28T00:00:00.000Z',
      boards: [
        { title: 'Board One', data: validBoard },
        {
          title: 'Board Two',
          data: {
            ...validBoard,
            title: 'Second Board',
          },
        },
      ],
    }

    expect(parseBoardsJson(JSON.stringify(payload))).toEqual([
      validBoard,
      {
        ...validBoard,
        title: 'Second Board',
      },
    ])
  })

  it('labels invalid multi-board entries in the thrown error', () =>
  {
    const payload = {
      version: 1,
      exportedAt: '2026-03-28T00:00:00.000Z',
      boards: [{ title: 'Broken Board', data: { tiers: [] } }],
    }

    expect(() => parseBoardsJson(JSON.stringify(payload))).toThrow(
      'Board "Broken Board" is invalid'
    )
  })
})
