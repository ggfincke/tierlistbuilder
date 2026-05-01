// tests/data/exportJson.test.ts
// JSON import & wire-mapper round-trip behavior

import { afterEach, describe, expect, it, vi } from 'vitest'
import { exportBoardAsJson } from '~/features/workspace/export/lib/exportJson'
import {
  parseBoardJson,
  parseBoardSnapshotJson,
  parseBoardsJson,
} from '~/shared/board-data/boardJson'
import {
  snapshotToWireWithBlobs,
  wireToSnapshot,
} from '~/shared/board-data/boardWireMapper'
import { stripImagesForShare } from '~/shared/sharing/hashShare'
import { BOARD_DATA_VERSION } from '@tierlistbuilder/contracts/workspace/boardEnvelope'
import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import { createPaletteTierColorSpec } from '~/shared/theme/tierColors'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import * as imagePersistence from '~/shared/images/imagePersistence'
import * as imageStore from '~/shared/images/imageStore'
import * as downloadBlobModule from '~/shared/lib/downloadBlob'
import { makeBoardSnapshot, makeItem, makeTier } from '../fixtures'

const makeValidBoard = (overrides?: Partial<BoardSnapshot>): BoardSnapshot =>
  makeBoardSnapshot({
    title: 'Test Board',
    tiers: [
      makeTier({ id: 'tier-s', name: 'S', itemIds: [asItemId('item-1')] }),
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

const wrap = (data: BoardSnapshot) =>
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
  it('parses a valid envelope w/ tier & item structure', async () =>
  {
    const result = await parseBoardJson(wrap(makeValidBoard()))
    expect(result.title).toBe('Test Board')
    expect(result.tiers).toHaveLength(2)
    expect(result.items['item-1'].label).toBe('First')
  })

  it('rejects malformed JSON, non-envelopes, & unsupported schema versions', async () =>
  {
    await expect(parseBoardJson('not json')).rejects.toThrow('Invalid JSON')
    await expect(parseBoardJson('[1, 2, 3]')).rejects.toThrow(
      'Invalid tier list format.'
    )
    await expect(
      parseBoardJson(JSON.stringify({ data: makeValidBoard() }))
    ).rejects.toThrow('missing a schema version')
    await expect(
      parseBoardJson(
        JSON.stringify({
          version: BOARD_DATA_VERSION + 1,
          data: makeValidBoard(),
        })
      )
    ).rejects.toThrow('File uses schema version')
  })

  it('rejects payloads w/ missing items map or dangling tier/unranked refs', async () =>
  {
    const danglingTierItem = {
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
    await expect(
      parseBoardJson(JSON.stringify(danglingTierItem))
    ).rejects.toThrow('Referenced item "missing-item" not found in items map.')

    const danglingUnranked = {
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
    await expect(
      parseBoardJson(JSON.stringify(danglingUnranked))
    ).rejects.toThrow('Referenced item "ghost" not found in items map.')

    const noItems = {
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
    await expect(parseBoardJson(JSON.stringify(noItems))).rejects.toThrow(
      'Missing items map'
    )
  })

  it('aborts when image storage is unavailable or persisting inline bytes fails', async () =>
  {
    const inlinePayload = {
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
          'item-1': { id: 'item-1', imageUrl: 'data:image/png;base64,AAAA' },
        },
        deletedItems: [],
        unrankedItemIds: [],
      },
    }

    vi.spyOn(imageStore, 'probeImageStore').mockResolvedValue(false)
    await expect(parseBoardJson(JSON.stringify(inlinePayload))).rejects.toThrow(
      /Image storage is unavailable/i
    )

    vi.restoreAllMocks()
    vi.spyOn(imageStore, 'probeImageStore').mockResolvedValue(true)
    vi.spyOn(imagePersistence, 'persistPreparedBlobRecords').mockRejectedValue(
      new Error('persist failed')
    )
    await expect(parseBoardJson(JSON.stringify(inlinePayload))).rejects.toThrow(
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
          'item-1': { id: 'item-1', imageRef: { hash: 'abc123' } },
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

describe('wire mapper round-trip', () =>
{
  it('preserves board style & per-item label overrides through the wire mapper', async () =>
  {
    const board = makeValidBoard({
      paletteId: 'twilight',
      textStyleId: 'rounded',
      pageBackground: '#123456',
      labels: { textColor: 'blue' },
      items: {
        'item-1': makeItem({
          id: asItemId('item-1'),
          label: 'First',
          labelOptions: { textColor: 'auto' },
        }),
        'item-2': makeItem({ id: asItemId('item-2'), label: 'Second' }),
      },
    })

    const wire = await snapshotToWireWithBlobs(board, new Map())
    expect(wire).toMatchObject({
      paletteId: 'twilight',
      textStyleId: 'rounded',
      pageBackground: '#123456',
    })
    expect(wire.items['item-1'].labelOptions).toEqual({ textColor: 'auto' })

    const restored = await wireToSnapshot(wire)
    expect(restored).toMatchObject({
      paletteId: 'twilight',
      textStyleId: 'rounded',
      pageBackground: '#123456',
    })
    expect(restored.items['item-1'].labelOptions).toEqual({ textColor: 'auto' })
  })

  it('strips image refs & deleted items from share payloads', () =>
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
})

describe('parseBoardsJson', () =>
{
  it('parses single & multi-board envelopes & wraps per-board errors w/ titles', async () =>
  {
    const single = await parseBoardsJson(wrap(makeValidBoard()))
    expect(single).toHaveLength(1)

    const multi = await parseBoardsJson(
      JSON.stringify({
        version: BOARD_DATA_VERSION,
        boards: [
          { title: 'Board A', data: makeValidBoard({ title: 'Board A' }) },
          { title: 'Board B', data: makeValidBoard({ title: 'Board B' }) },
        ],
      })
    )
    expect(multi.map((b) => b.title)).toEqual(['Board A', 'Board B'])

    await expect(
      parseBoardsJson(
        JSON.stringify({
          version: BOARD_DATA_VERSION,
          boards: [
            { title: 'Good', data: makeValidBoard() },
            { title: 'Broken', data: { tiers: [] } },
          ],
        })
      )
    ).rejects.toThrow('Board "Broken" is invalid')

    await expect(
      parseBoardsJson(
        JSON.stringify({ version: BOARD_DATA_VERSION, boards: [] })
      )
    ).rejects.toThrow('Export file contains no boards.')
  })
})

describe('parseBoardSnapshotJson', () =>
{
  it('parses a bare snapshot payload for share-link decode', async () =>
  {
    const result = await parseBoardSnapshotJson(
      JSON.stringify(makeValidBoard({ title: 'Shared Board' })),
      'Shared Board'
    )
    expect(result.title).toBe('Shared Board')
    expect(result.items['item-1'].label).toBe('First')
  })
})
