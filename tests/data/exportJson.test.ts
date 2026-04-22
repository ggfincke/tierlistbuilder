// tests/data/exportJson.test.ts
// JSON import/export parsing

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  exportBoardAsJson,
  parseBoardJson,
  parseBoardSnapshotJson,
  parseBoardsJson,
} from '~/features/workspace/export/lib/exportJson'
import { stripImagesForShare } from '~/features/workspace/sharing/snapshot-compression/hashShare'
import { BOARD_DATA_VERSION } from '@tierlistbuilder/contracts/workspace/boardEnvelope'
import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import { createPaletteTierColorSpec } from '~/shared/theme/tierColors'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import * as imagePersistence from '~/shared/images/imagePersistence'
import * as imageStore from '~/shared/images/imageStore'
import * as downloadBlobModule from '~/shared/lib/downloadBlob'
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

afterEach(() =>
{
  vi.restoreAllMocks()
})

describe('parseBoardJson', () =>
{
  it('parses a valid wrapped envelope', async () =>
  {
    const board = makeValidBoard()
    const result = await parseBoardJson(wrapEnvelope(board))
    expect(result.title).toBe('Test Board')
    expect(result.tiers).toHaveLength(2)
    expect(result.tiers[0].name).toBe('S')
    expect(result.items['item-1'].label).toBe('First')
  })

  it('throws on invalid JSON', async () =>
  {
    await expect(parseBoardJson('not json')).rejects.toThrow(
      'Invalid JSON file.'
    )
  })

  it('throws on JSON array', async () =>
  {
    await expect(parseBoardJson('[1, 2, 3]')).rejects.toThrow(
      'Invalid tier list format.'
    )
  })

  it('throws on JSON null', async () =>
  {
    await expect(parseBoardJson('null')).rejects.toThrow(
      'Invalid tier list format.'
    )
  })

  it('throws on JSON primitive', async () =>
  {
    await expect(parseBoardJson('"hello"')).rejects.toThrow(
      'Invalid tier list format.'
    )
  })

  it('rejects envelopes missing a schema version', async () =>
  {
    const unversioned = { data: makeValidBoard() }
    await expect(parseBoardJson(JSON.stringify(unversioned))).rejects.toThrow(
      'missing a schema version'
    )
  })

  it('rejects envelopes missing a data payload', async () =>
  {
    const noData = { version: BOARD_DATA_VERSION, exportedAt: 'now' }
    await expect(parseBoardJson(JSON.stringify(noData))).rejects.toThrow(
      'missing a "data" payload'
    )
  })

  it('rejects envelopes newer than the supported schema version', async () =>
  {
    const future = {
      version: BOARD_DATA_VERSION + 1,
      data: makeValidBoard(),
    }
    await expect(parseBoardJson(JSON.stringify(future))).rejects.toThrow(
      'File uses schema version'
    )
  })

  it('throws when tiers array is missing', async () =>
  {
    await expect(
      parseBoardJson(
        JSON.stringify({
          version: BOARD_DATA_VERSION,
          data: { items: {}, unrankedItemIds: [] },
        })
      )
    ).rejects.toThrow('File must contain at least one tier.')
  })

  it('throws when tiers array is empty', async () =>
  {
    await expect(
      parseBoardJson(
        JSON.stringify({
          version: BOARD_DATA_VERSION,
          data: { tiers: [], items: {} },
        })
      )
    ).rejects.toThrow('File must contain at least one tier.')
  })

  it('throws on invalid tier structure — missing id', async () =>
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
    await expect(parseBoardJson(JSON.stringify(bad))).rejects.toThrow(
      'missing a valid "id"'
    )
  })

  it('throws on invalid tier structure — missing colorSpec', async () =>
  {
    const bad = {
      version: BOARD_DATA_VERSION,
      data: {
        tiers: [{ id: 'tier-s', name: 'S', itemIds: [] }],
        items: {},
      },
    }
    await expect(parseBoardJson(JSON.stringify(bad))).rejects.toThrow(
      'missing a valid "colorSpec"'
    )
  })

  it('throws on invalid tier structure — missing itemIds', async () =>
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
    await expect(parseBoardJson(JSON.stringify(bad))).rejects.toThrow(
      'missing "itemIds" array'
    )
  })

  it('throws when items map is missing', async () =>
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
    await expect(parseBoardJson(JSON.stringify(bad))).rejects.toThrow(
      'Missing items map'
    )
  })

  it('throws when a referenced tier item is missing from the items map', async () =>
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
    await expect(parseBoardJson(JSON.stringify(bad))).rejects.toThrow(
      'Referenced item "missing-item" not found in items map.'
    )
  })

  it('throws when an unranked item is missing from the items map', async () =>
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
    await expect(parseBoardJson(JSON.stringify(bad))).rejects.toThrow(
      'Referenced item "ghost" not found in items map.'
    )
  })

  it('normalizes data via normalizeBoardSnapshot (fallback title applied)', async () =>
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
    const result = await parseBoardJson(JSON.stringify(noTitle))
    expect(result.title).toBe('Imported Tier List')
  })

  it('drops image refs & deleted items from share payloads', async () =>
  {
    const board = makeValidBoard({
      items: {
        'item-1': makeItem({
          id: asItemId('item-1'),
          imageRef: { hash: 'abc' },
        }),
        'item-2': makeItem({ id: asItemId('item-2'), label: 'Second' }),
      },
    })

    const shared = stripImagesForShare(board)
    expect(
      (shared.items['item-1'] as { imageRef?: unknown }).imageRef
    ).toBeUndefined()
    expect(shared.deletedItems).toHaveLength(0)
  })

  it('aborts import when IDB is unavailable & the payload has inline bytes', async () =>
  {
    vi.spyOn(imageStore, 'probeImageStore').mockResolvedValue(false)

    const payload = {
      version: BOARD_DATA_VERSION,
      data: {
        title: 'Inline Import',
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
            imageUrl: 'data:image/png;base64,AAAA',
          },
        },
        deletedItems: [],
        unrankedItemIds: [],
      },
    }

    await expect(parseBoardJson(JSON.stringify(payload))).rejects.toThrow(
      /Image storage is unavailable/i
    )
  })

  it('aborts import when persisting inline bytes fails', async () =>
  {
    vi.spyOn(imageStore, 'probeImageStore').mockResolvedValue(true)
    vi.spyOn(imagePersistence, 'persistPreparedBlobRecords').mockRejectedValue(
      new Error('persist failed')
    )

    const payload = {
      version: BOARD_DATA_VERSION,
      data: {
        title: 'Inline Import',
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
            imageUrl: 'data:image/png;base64,AAAA',
          },
        },
        deletedItems: [],
        unrankedItemIds: [],
      },
    }

    await expect(parseBoardJson(JSON.stringify(payload))).rejects.toThrow(
      /persist failed/
    )
  })

  it('rejects local-only imageRef entries without inline image bytes', async () =>
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

    await expect(parseBoardJson(JSON.stringify(payload))).rejects.toThrow(
      'uses a local imageRef without inline imageUrl bytes'
    )
  })

  it('fails export when a referenced image blob is missing', async () =>
  {
    const board = makeValidBoard({
      items: {
        [asItemId('item-1')]: makeItem({
          id: asItemId('item-1'),
          imageRef: { hash: 'missing-hash' },
        }),
        [asItemId('item-2')]: makeItem({
          id: asItemId('item-2'),
          label: 'Second',
        }),
      },
    })
    const downloadSpy = vi.spyOn(downloadBlobModule, 'downloadBlob')

    await expect(exportBoardAsJson(board, board.title)).rejects.toThrow(
      'Missing image bytes for item "item-1"'
    )
    expect(downloadSpy).not.toHaveBeenCalled()
  })
})

describe('parseBoardsJson', () =>
{
  it('parses a single-board envelope as a one-element array', async () =>
  {
    const board = makeValidBoard()
    const results = await parseBoardsJson(wrapEnvelope(board))
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Test Board')
  })

  it('parses multi-board envelope w/ boards array', async () =>
  {
    const boards = {
      version: BOARD_DATA_VERSION,
      boards: [
        { title: 'Board A', data: makeValidBoard({ title: 'Board A' }) },
        { title: 'Board B', data: makeValidBoard({ title: 'Board B' }) },
      ],
    }
    const results = await parseBoardsJson(JSON.stringify(boards))
    expect(results).toHaveLength(2)
    expect(results[0].title).toBe('Board A')
    expect(results[1].title).toBe('Board B')
  })

  it('throws on empty boards array', async () =>
  {
    const empty = { version: BOARD_DATA_VERSION, boards: [] }
    await expect(parseBoardsJson(JSON.stringify(empty))).rejects.toThrow(
      'Export file contains no boards.'
    )
  })

  it('wraps per-board errors w/ the board title', async () =>
  {
    const badMulti = {
      version: BOARD_DATA_VERSION,
      boards: [
        { title: 'Good', data: makeValidBoard() },
        { title: 'Broken', data: { tiers: [] } },
      ],
    }
    await expect(parseBoardsJson(JSON.stringify(badMulti))).rejects.toThrow(
      'Board "Broken" is invalid'
    )
  })

  it('uses board index when title is missing in error messages', async () =>
  {
    const badMulti = {
      version: BOARD_DATA_VERSION,
      boards: [{ data: { tiers: [] } }],
    }
    await expect(parseBoardsJson(JSON.stringify(badMulti))).rejects.toThrow(
      'Board "#1" is invalid'
    )
  })

  it('rejects multi-board entries that are missing a data wrapper', async () =>
  {
    const board = makeValidBoard({ title: 'Inline' })
    const multi = { version: BOARD_DATA_VERSION, boards: [board] }
    await expect(parseBoardsJson(JSON.stringify(multi))).rejects.toThrow(
      'missing a "data" payload'
    )
  })
})

describe('parseBoardSnapshotJson', () =>
{
  it('parses a bare snapshot payload for share-link decode', async () =>
  {
    const board = makeValidBoard({ title: 'Shared Board' })
    const result = await parseBoardSnapshotJson(
      JSON.stringify(board),
      'Shared Board'
    )
    expect(result.title).toBe('Shared Board')
    expect(result.items['item-1'].label).toBe('First')
  })
})
