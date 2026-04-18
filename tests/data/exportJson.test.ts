// tests/data/exportJson.test.ts
// JSON import/export parsing

import { describe, it, expect } from 'vitest'
import {
  parseBoardJson,
  parseBoardSnapshotJson,
  parseBoardsJson,
} from '~/features/workspace/export/lib/exportJson'
import { BOARD_DATA_VERSION } from '~/features/workspace/boards/data/local/boardStorage'
import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import { createPaletteTierColorSpec } from '~/shared/theme/tierColors'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import { makeBoardSnapshot, makeItem, makeTier } from '../fixtures'

// minimal valid board data — satisfies parseBoardJson validation
const makeValidBoard = (overrides?: Partial<BoardSnapshot>): BoardSnapshot =>
  makeBoardSnapshot({
    title: 'Test Board',
    tiers: [
      makeTier({
        id: 'tier-s',
        name: 'S',
        itemIds: [asItemId('item-1')],
      }),
      makeTier({
        id: 'tier-a',
        name: 'A',
        colorSpec: createPaletteTierColorSpec(1),
      }),
    ],
    unrankedItemIds: [asItemId('item-2')],
    items: {
      [asItemId('item-1')]: makeItem({
        id: asItemId('item-1'),
        label: 'First',
      }),
      [asItemId('item-2')]: makeItem({
        id: asItemId('item-2'),
        label: 'Second',
      }),
    },
    ...overrides,
  })

// wrap board data in the current versioned export envelope
const wrapEnvelope = (data: BoardSnapshot) =>
  JSON.stringify({
    version: BOARD_DATA_VERSION,
    exportedAt: '2026-01-01T00:00:00Z',
    data,
  })

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

  it('rejects envelopes missing a schema version', () =>
  {
    const unversioned = { data: makeValidBoard() }
    expect(() => parseBoardJson(JSON.stringify(unversioned))).toThrow(
      'missing a schema version'
    )
  })

  it('rejects envelopes missing a data payload', () =>
  {
    const noData = { version: BOARD_DATA_VERSION, exportedAt: 'now' }
    expect(() => parseBoardJson(JSON.stringify(noData))).toThrow(
      'missing a "data" payload'
    )
  })

  it('rejects envelopes newer than the supported schema version', () =>
  {
    const future = {
      version: BOARD_DATA_VERSION + 1,
      data: makeValidBoard(),
    }
    expect(() => parseBoardJson(JSON.stringify(future))).toThrow(
      'File uses schema version'
    )
  })

  it('throws when tiers array is missing', () =>
  {
    expect(() =>
      parseBoardJson(
        JSON.stringify({
          version: BOARD_DATA_VERSION,
          data: { items: {}, unrankedItemIds: [] },
        })
      )
    ).toThrow('File must contain at least one tier.')
  })

  it('throws when tiers array is empty', () =>
  {
    expect(() =>
      parseBoardJson(
        JSON.stringify({
          version: BOARD_DATA_VERSION,
          data: { tiers: [], items: {} },
        })
      )
    ).toThrow('File must contain at least one tier.')
  })

  it('throws on invalid tier structure — missing id', () =>
  {
    const bad = {
      version: BOARD_DATA_VERSION,
      data: {
        tiers: [
          { name: 'S', colorSpec: { kind: 'palette', index: 0 }, itemIds: [] },
        ],
        items: {},
      },
    }
    expect(() => parseBoardJson(JSON.stringify(bad))).toThrow(
      'missing a valid "id"'
    )
  })

  it('throws on invalid tier structure — missing colorSpec', () =>
  {
    const bad = {
      version: BOARD_DATA_VERSION,
      data: {
        tiers: [{ id: 'tier-s', name: 'S', itemIds: [] }],
        items: {},
      },
    }
    expect(() => parseBoardJson(JSON.stringify(bad))).toThrow(
      'missing a valid "colorSpec"'
    )
  })

  it('throws on invalid tier structure — missing itemIds', () =>
  {
    const bad = {
      version: BOARD_DATA_VERSION,
      data: {
        tiers: [
          {
            id: 'tier-s',
            name: 'S',
            colorSpec: { kind: 'palette', index: 0 },
          },
        ],
        items: {},
      },
    }
    expect(() => parseBoardJson(JSON.stringify(bad))).toThrow(
      'missing "itemIds" array'
    )
  })

  it('throws when items map is missing', () =>
  {
    const bad = {
      version: BOARD_DATA_VERSION,
      data: {
        tiers: [
          {
            id: 'tier-s',
            name: 'S',
            colorSpec: { kind: 'palette', index: 0 },
            itemIds: [],
          },
        ],
      },
    }
    expect(() => parseBoardJson(JSON.stringify(bad))).toThrow(
      'Missing items map'
    )
  })

  it('throws when a referenced tier item is missing from the items map', () =>
  {
    const bad = {
      version: BOARD_DATA_VERSION,
      data: {
        tiers: [
          {
            id: 'tier-s',
            name: 'S',
            colorSpec: { kind: 'palette', index: 0 },
            itemIds: ['missing-item'],
          },
        ],
        items: {},
      },
    }
    expect(() => parseBoardJson(JSON.stringify(bad))).toThrow(
      'Referenced item "missing-item" not found in items map.'
    )
  })

  it('throws when an unranked item is missing from the items map', () =>
  {
    const bad = {
      version: BOARD_DATA_VERSION,
      data: {
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
      },
    }
    expect(() => parseBoardJson(JSON.stringify(bad))).toThrow(
      'Referenced item "ghost" not found in items map.'
    )
  })

  it('normalizes data via normalizeBoardSnapshot (fallback title applied)', () =>
  {
    const noTitle = {
      version: BOARD_DATA_VERSION,
      data: {
        tiers: [
          {
            id: 'tier-s',
            name: 'S',
            colorSpec: { kind: 'palette', index: 0 },
            itemIds: [],
          },
        ],
        items: {},
      },
    }
    const result = parseBoardJson(JSON.stringify(noTitle))
    expect(result.title).toBe('Imported Tier List')
  })

  it('preserves inline imageUrl values for later migration', () =>
  {
    const board = makeValidBoard({
      items: {
        'item-1': {
          id: 'item-1',
          imageUrl: 'data:image/png;base64,AA==',
        },
        'item-2': { id: 'item-2', label: 'Second' },
      },
    })

    const result = parseBoardJson(wrapEnvelope(board))
    expect(result.items['item-1'].imageUrl).toBe('data:image/png;base64,AA==')
  })

  it('rejects local-only imageRef entries without inline image bytes', () =>
  {
    const payload = {
      version: BOARD_DATA_VERSION,
      data: {
        title: 'Broken Export',
        tiers: [
          {
            id: 'tier-s',
            name: 'S',
            colorSpec: { kind: 'palette', index: 0 },
            itemIds: ['item-1'],
          },
        ],
        items: {
          'item-1': {
            id: 'item-1',
            imageRef: { hash: 'abc123' },
          },
        },
        deletedItems: [],
        unrankedItemIds: [],
      },
    }

    expect(() => parseBoardJson(JSON.stringify(payload))).toThrow(
      'uses a local imageRef without inline imageUrl bytes'
    )
  })
})

describe('parseBoardsJson', () =>
{
  it('parses a single-board envelope as a one-element array', () =>
  {
    const board = makeValidBoard()
    const results = parseBoardsJson(wrapEnvelope(board))
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Test Board')
  })

  it('parses multi-board envelope w/ boards array', () =>
  {
    const boards = {
      version: BOARD_DATA_VERSION,
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
    const empty = { version: BOARD_DATA_VERSION, boards: [] }
    expect(() => parseBoardsJson(JSON.stringify(empty))).toThrow(
      'Export file contains no boards.'
    )
  })

  it('wraps per-board errors w/ the board title', () =>
  {
    const badMulti = {
      version: BOARD_DATA_VERSION,
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
      version: BOARD_DATA_VERSION,
      boards: [{ data: { tiers: [] } }],
    }
    expect(() => parseBoardsJson(JSON.stringify(badMulti))).toThrow(
      'Board "#1" is invalid'
    )
  })

  it('rejects multi-board entries that are missing a data wrapper', () =>
  {
    const board = makeValidBoard({ title: 'Inline' })
    const multi = { version: BOARD_DATA_VERSION, boards: [board] }
    expect(() => parseBoardsJson(JSON.stringify(multi))).toThrow(
      'missing a "data" payload'
    )
  })
})

describe('parseBoardSnapshotJson', () =>
{
  it('parses a bare snapshot payload for share-link decode', () =>
  {
    const board = makeValidBoard({ title: 'Shared Board' })
    const result = parseBoardSnapshotJson(JSON.stringify(board), 'Shared Board')
    expect(result.title).toBe('Shared Board')
    expect(result.items['item-1'].label).toBe('First')
  })
})
