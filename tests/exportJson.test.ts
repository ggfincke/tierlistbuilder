import { describe, it, expect } from 'vitest'
import { parseBoardJson, parseBoardsJson } from '../src/utils/exportJson'
import type { TierListData } from '../src/types'
import { createPaletteTierColorSpec } from '../src/domain/tierColors'

// minimal valid board data — satisfies parseBoardJson validation
const makeValidBoard = (overrides?: Partial<TierListData>): TierListData => ({
  title: 'Test Board',
  tiers: [
    {
      id: 'tier-s',
      name: 'S',
      colorSpec: createPaletteTierColorSpec(0),
      itemIds: ['item-1'],
    },
    {
      id: 'tier-a',
      name: 'A',
      colorSpec: createPaletteTierColorSpec(1),
      itemIds: [],
    },
  ],
  unrankedItemIds: ['item-2'],
  items: {
    'item-1': { id: 'item-1', label: 'First' },
    'item-2': { id: 'item-2', label: 'Second' },
  },
  deletedItems: [],
  ...overrides,
})

// wrap board data in the versioned export envelope
const wrapEnvelope = (data: TierListData) =>
  JSON.stringify({ version: 3, exportedAt: '2026-01-01T00:00:00Z', data })

describe('parseBoardJson', () =>
{
  it('parses a valid wrapped envelope', () =>
  {
    const board = makeValidBoard()
    const result = parseBoardJson(wrapEnvelope(board))
    expect(result.title).toBe('Test Board')
    expect(result.tiers).toHaveLength(2)
    expect(result.tiers[0].name).toBe('S')
    expect(result.items['item-1'].label).toBe('First')
  })

  it('parses raw TierListData without an envelope wrapper', () =>
  {
    const board = makeValidBoard()
    const result = parseBoardJson(JSON.stringify(board))
    expect(result.title).toBe('Test Board')
    expect(result.tiers).toHaveLength(2)
  })

  it('throws on invalid JSON', () =>
  {
    expect(() => parseBoardJson('not json')).toThrow('Invalid JSON file.')
  })

  it('throws on JSON array', () =>
  {
    expect(() => parseBoardJson('[1, 2, 3]')).toThrow(
      'Invalid tier list format.'
    )
  })

  it('throws on JSON null', () =>
  {
    expect(() => parseBoardJson('null')).toThrow('Invalid tier list format.')
  })

  it('throws on JSON primitive', () =>
  {
    expect(() => parseBoardJson('"hello"')).toThrow('Invalid tier list format.')
  })

  it('throws when tiers array is missing', () =>
  {
    expect(() =>
      parseBoardJson(JSON.stringify({ items: {}, unrankedItemIds: [] }))
    ).toThrow('File must contain at least one tier.')
  })

  it('throws when tiers array is empty', () =>
  {
    expect(() =>
      parseBoardJson(JSON.stringify({ tiers: [], items: {} }))
    ).toThrow('File must contain at least one tier.')
  })

  it('throws on invalid tier structure — missing id', () =>
  {
    const bad = {
      tiers: [
        { name: 'S', colorSpec: { kind: 'palette', index: 0 }, itemIds: [] },
      ],
      items: {},
    }
    expect(() => parseBoardJson(JSON.stringify(bad))).toThrow(
      'Invalid tier structure'
    )
  })

  it('throws on invalid tier structure — missing color data', () =>
  {
    const bad = {
      tiers: [{ id: 'tier-s', name: 'S', itemIds: [] }],
      items: {},
    }
    expect(() => parseBoardJson(JSON.stringify(bad))).toThrow(
      'Invalid tier structure'
    )
  })

  it('throws on invalid tier structure — missing itemIds', () =>
  {
    const bad = {
      tiers: [
        {
          id: 'tier-s',
          name: 'S',
          colorSpec: { kind: 'palette', index: 0 },
        },
      ],
      items: {},
    }
    expect(() => parseBoardJson(JSON.stringify(bad))).toThrow(
      'Invalid tier structure'
    )
  })

  it('throws when items map is missing', () =>
  {
    const bad = {
      tiers: [
        {
          id: 'tier-s',
          name: 'S',
          colorSpec: { kind: 'palette', index: 0 },
          itemIds: [],
        },
      ],
    }
    expect(() => parseBoardJson(JSON.stringify(bad))).toThrow(
      'Missing items map.'
    )
  })

  it('throws when a referenced tier item is missing from the items map', () =>
  {
    const bad = {
      tiers: [
        {
          id: 'tier-s',
          name: 'S',
          colorSpec: { kind: 'palette', index: 0 },
          itemIds: ['missing-item'],
        },
      ],
      items: {},
    }
    expect(() => parseBoardJson(JSON.stringify(bad))).toThrow(
      'Referenced item "missing-item" not found in items map.'
    )
  })

  it('throws when an unranked item is missing from the items map', () =>
  {
    const bad = {
      tiers: [
        {
          id: 'tier-s',
          name: 'S',
          colorSpec: { kind: 'palette', index: 0 },
          itemIds: [],
        },
      ],
      items: {},
      unrankedItemIds: ['ghost'],
    }
    expect(() => parseBoardJson(JSON.stringify(bad))).toThrow(
      'Referenced item "ghost" not found in items map.'
    )
  })

  it('accepts tiers w/ legacy color string instead of colorSpec', () =>
  {
    const legacy = {
      tiers: [
        { id: 'tier-custom', name: 'Custom', color: '#ff0000', itemIds: [] },
      ],
      items: {},
    }
    const result = parseBoardJson(JSON.stringify(legacy))
    expect(result.tiers[0].colorSpec).toEqual({
      kind: 'custom',
      hex: '#ff0000',
    })
  })

  it('normalizes data via normalizeTierListData (fallback title applied)', () =>
  {
    const noTitle = {
      tiers: [
        {
          id: 'tier-s',
          name: 'S',
          colorSpec: { kind: 'palette', index: 0 },
          itemIds: [],
        },
      ],
      items: {},
    }
    const result = parseBoardJson(JSON.stringify(noTitle))
    expect(result.title).toBe('Imported Tier List')
  })
})

describe('parseBoardsJson', () =>
{
  it('parses a single-board JSON as a one-element array', () =>
  {
    const board = makeValidBoard()
    const results = parseBoardsJson(wrapEnvelope(board))
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Test Board')
  })

  it('parses multi-board envelope w/ boards array', () =>
  {
    const boards = {
      version: 3,
      boards: [
        { title: 'Board A', data: makeValidBoard({ title: 'Board A' }) },
        { title: 'Board B', data: makeValidBoard({ title: 'Board B' }) },
      ],
    }
    const results = parseBoardsJson(JSON.stringify(boards))
    expect(results).toHaveLength(2)
    expect(results[0].title).toBe('Board A')
    expect(results[1].title).toBe('Board B')
  })

  it('throws on empty boards array', () =>
  {
    const empty = { version: 3, boards: [] }
    expect(() => parseBoardsJson(JSON.stringify(empty))).toThrow(
      'Export file contains no boards.'
    )
  })

  it('wraps per-board errors w/ the board title', () =>
  {
    const badMulti = {
      version: 3,
      boards: [
        { title: 'Good', data: makeValidBoard() },
        { title: 'Broken', data: { tiers: [] } },
      ],
    }
    expect(() => parseBoardsJson(JSON.stringify(badMulti))).toThrow(
      'Board "Broken" is invalid'
    )
  })

  it('uses board index when title is missing in error messages', () =>
  {
    const badMulti = {
      version: 3,
      boards: [{ tiers: [] }],
    }
    expect(() => parseBoardsJson(JSON.stringify(badMulti))).toThrow(
      'Board "#1" is invalid'
    )
  })

  it('handles multi-board entries w/ inline data (no .data wrapper)', () =>
  {
    const board = makeValidBoard({ title: 'Inline' })
    const multi = { version: 3, boards: [board] }
    const results = parseBoardsJson(JSON.stringify(multi))
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Inline')
  })
})
