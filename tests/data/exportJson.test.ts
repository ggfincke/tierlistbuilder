// tests/data/exportJson.test.ts
// JSON import/export parsing

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  exportBoardAsJson,
  parseBoardJson,
  parseBoardSnapshotJson,
  parseBoardsJson,
} from '~/features/workspace/export/lib/exportJson'
import { stripImagesForShare } from '~/shared/sharing/hashShare'
import { BOARD_DATA_VERSION } from '@tierlistbuilder/contracts/workspace/boardEnvelope'
import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import { createPaletteTierColorSpec } from '~/shared/theme/tierColors'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
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

  it('preserves source metadata and source template item ids on import', async () =>
  {
    const board = makeValidBoard({
      sourceTemplateId: 'Template123',
      sourceTemplateTitle: 'Template',
      sourceRankingId: 'Ranking123',
      sourceRankingTitle: 'Ranking',
      preferredCriterionExternalId: 'favorites',
      items: {
        [asItemId('item-1')]: makeItem({
          id: asItemId('item-1'),
          label: 'First',
          sourceTemplateItemExternalId: 'template-item-1',
        }),
        [asItemId('item-2')]: makeItem({
          id: asItemId('item-2'),
          label: 'Second',
          sourceTemplateItemExternalId: 'template-item-2',
        }),
      },
    })

    const result = await parseBoardJson(wrapEnvelope(board))

    expect(result).toMatchObject({
      sourceTemplateId: 'Template123',
      sourceTemplateTitle: 'Template',
      sourceRankingId: 'Ranking123',
      sourceRankingTitle: 'Ranking',
      preferredCriterionExternalId: 'favorites',
    })
    expect(result.items['item-1'].sourceTemplateItemExternalId).toBe(
      'template-item-1'
    )
  })

  it('throws on invalid JSON', async () =>
  {
    await expect(parseBoardJson('not json')).rejects.toThrow(
      'Invalid JSON file.'
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

  it('drops image refs & deleted items from share payloads', async () =>
  {
    const board = makeValidBoard({
      items: {
        'item-1': makeItem({
          id: asItemId('item-1'),
          imageRef: { hash: 'abc' },
          tileImageRef: { hash: 'tile-abc' },
        }),
        'item-2': makeItem({ id: asItemId('item-2'), label: 'Second' }),
      },
    })

    const shared = stripImagesForShare(board)
    expect(
      (shared.items['item-1'] as { imageRef?: unknown }).imageRef
    ).toBeUndefined()
    expect(
      (shared.items['item-1'] as { tileImageRef?: unknown }).tileImageRef
    ).toBeUndefined()
    expect(shared.deletedItems).toHaveLength(0)
  })

  it('falls back to tile bytes when source bytes are missing on export', async () =>
  {
    const tileBlob = new Blob(['tile'], { type: 'image/webp' })
    const previewBlob = new Blob(['preview'], { type: 'image/png' })
    const board = makeValidBoard({
      items: {
        [asItemId('item-1')]: makeItem({
          id: asItemId('item-1'),
          imageRef: { hash: 'thumb-hash' },
          tileImageRef: { hash: 'tile-hash' },
          sourceImageRef: { hash: 'source-hash' },
        }),
        [asItemId('item-2')]: makeItem({
          id: asItemId('item-2'),
          label: 'Second',
        }),
      },
    })
    vi.spyOn(imageStore, 'getBlobsBatch').mockResolvedValue(
      new Map([
        ['source-hash', null],
        [
          'tile-hash',
          {
            hash: 'tile-hash',
            mimeType: tileBlob.type,
            byteSize: tileBlob.size,
            createdAt: 0,
            bytes: tileBlob,
          },
        ],
        [
          'thumb-hash',
          {
            hash: 'thumb-hash',
            mimeType: previewBlob.type,
            byteSize: previewBlob.size,
            createdAt: 0,
            bytes: previewBlob,
          },
        ],
      ])
    )
    const downloadSpy = vi
      .spyOn(downloadBlobModule, 'downloadBlob')
      .mockImplementation(() => undefined)

    await exportBoardAsJson(board, board.title)

    const payload = JSON.parse(await downloadSpy.mock.calls[0][0].text()) as {
      data: { items: Record<string, { imageUrl?: string }> }
    }
    expect(payload.data.items['item-1'].imageUrl).toBe(
      'data:image/webp;base64,dGlsZQ=='
    )
  })
})

describe('parseBoardsJson', () =>
{
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
