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
import * as imagePersistence from '~/shared/images/imagePersistence'
import * as imageStore from '~/shared/images/imageStore'
import * as downloadBlobModule from '~/shared/lib/downloadBlob'
import { makeBoardSnapshot, makeItem, makeTier } from '@tests/fixtures'

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

  it.each([['[1, 2, 3]'], ['null'], ['"hello"']])(
    'throws on valid JSON that is not an envelope object: %s',
    async (input) =>
    {
      await expect(parseBoardJson(input)).rejects.toThrow(
        'Invalid tier list format.'
      )
    }
  )

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

  it.each([
    [
      'missing a valid "id"',
      { name: 'S', colorSpec: { kind: 'palette', index: 0 }, itemIds: [] },
    ],
    ['missing a valid "colorSpec"', { id: 'tier-s', name: 'S', itemIds: [] }],
    [
      'missing "itemIds" array',
      { id: 'tier-s', name: 'S', colorSpec: { kind: 'palette', index: 0 } },
    ],
  ])('throws on invalid tier structure (%s)', async (expected, tier) =>
  {
    const bad = {
      version: BOARD_DATA_VERSION,
      data: { tiers: [tier], items: {} },
    }
    await expect(parseBoardJson(JSON.stringify(bad))).rejects.toThrow(expected)
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

  it('preserves notes and source metadata through JSON import', async () =>
  {
    const payload = {
      version: BOARD_DATA_VERSION,
      data: {
        title: 'Imported fork',
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
            label: 'First',
            notes: 'Private note',
            sourceTemplateItemExternalId: 'template-item-1',
          },
        },
        deletedItems: [
          {
            id: 'deleted-1',
            label: 'Deleted',
            notes: 'Deleted note',
            sourceTemplateItemExternalId: 'template-item-deleted',
          },
        ],
        unrankedItemIds: [],
        sourceTemplateId: 'template-slug',
        sourceRankingId: 'ranking-slug',
        sourceTemplateTitle: 'Template title',
        sourceRankingTitle: 'Ranking title',
        preferredCriterionExternalId: 'criterion-external-id',
        sourceTemplateCoverMedia: {
          externalId: 'media-cover',
          contentHash: 'cover-hash',
          url: 'https://example.test/cover.webp',
          width: 1200,
          height: 800,
          mimeType: 'image/webp',
        },
        sourceTemplateCoverFraming: {
          browseHero: null,
          detailHero: null,
          card: { x: 0, y: 0, width: 1, height: 1 },
        },
      },
    }

    const result = await parseBoardJson(JSON.stringify(payload))

    expect(result.items['item-1']).toMatchObject({
      notes: 'Private note',
      sourceTemplateItemExternalId: 'template-item-1',
    })
    expect(result.deletedItems[0]).toMatchObject({
      notes: 'Deleted note',
      sourceTemplateItemExternalId: 'template-item-deleted',
    })
    expect(result.sourceTemplateId).toBe('template-slug')
    expect(result.sourceRankingId).toBe('ranking-slug')
    expect(result.sourceTemplateTitle).toBe('Template title')
    expect(result.sourceRankingTitle).toBe('Ranking title')
    expect(result.preferredCriterionExternalId).toBe('criterion-external-id')
    expect(result.sourceTemplateCoverMedia?.externalId).toBe('media-cover')
    expect(result.sourceTemplateCoverFraming?.card).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    })
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

  it.each([
    [
      'IDB probe fails',
      () => vi.spyOn(imageStore, 'probeImageStore').mockResolvedValue(false),
      /Image storage is unavailable/i,
    ],
    [
      'persisting inline bytes throws',
      () =>
      {
        vi.spyOn(imageStore, 'probeImageStore').mockResolvedValue(true)
        vi.spyOn(
          imagePersistence,
          'persistPreparedBlobRecords'
        ).mockRejectedValue(new Error('persist failed'))
      },
      /persist failed/,
    ],
  ])(
    'aborts inline-image import when %s',
    async (_label, setup, expectedError) =>
    {
      setup()
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
        expectedError
      )
    }
  )

  it('rejects local-only image refs without inline image bytes', async () =>
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
      'uses a local image ref without inline imageUrl bytes'
    )
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

  it('preserves notes and source metadata through JSON export', async () =>
  {
    const board = makeValidBoard({
      sourceTemplateId: 'template-slug',
      sourceRankingId: 'ranking-slug',
      sourceTemplateTitle: 'Template title',
      sourceRankingTitle: 'Ranking title',
      preferredCriterionExternalId: 'criterion-external-id',
      sourceTemplateCoverMedia: {
        externalId: 'media-cover',
        contentHash: 'cover-hash',
        url: 'https://example.test/cover.webp',
        width: 1200,
        height: 800,
        mimeType: 'image/webp',
      },
      sourceTemplateCoverFraming: {
        browseHero: null,
        detailHero: null,
        card: { x: 0, y: 0, width: 1, height: 1 },
      },
      items: {
        [asItemId('item-1')]: makeItem({
          id: asItemId('item-1'),
          label: 'First',
          notes: 'Private note',
          sourceTemplateItemExternalId: 'template-item-1',
        }),
        [asItemId('item-2')]: makeItem({
          id: asItemId('item-2'),
          label: 'Second',
        }),
      },
      deletedItems: [
        makeItem({
          id: asItemId('deleted-1'),
          label: 'Deleted',
          notes: 'Deleted note',
          sourceTemplateItemExternalId: 'template-item-deleted',
        }),
      ],
    })
    const downloadSpy = vi
      .spyOn(downloadBlobModule, 'downloadBlob')
      .mockImplementation(() => undefined)

    await exportBoardAsJson(board, board.title)

    const payload = JSON.parse(await downloadSpy.mock.calls[0][0].text()) as {
      data: BoardSnapshot
    }
    expect(payload.data.items['item-1']).toMatchObject({
      notes: 'Private note',
      sourceTemplateItemExternalId: 'template-item-1',
    })
    expect(payload.data.deletedItems[0]).toMatchObject({
      notes: 'Deleted note',
      sourceTemplateItemExternalId: 'template-item-deleted',
    })
    expect(payload.data.sourceTemplateId).toBe('template-slug')
    expect(payload.data.sourceRankingId).toBe('ranking-slug')
    expect(payload.data.sourceTemplateTitle).toBe('Template title')
    expect(payload.data.sourceRankingTitle).toBe('Ranking title')
    expect(payload.data.preferredCriterionExternalId).toBe(
      'criterion-external-id'
    )
    expect(payload.data.sourceTemplateCoverMedia?.externalId).toBe(
      'media-cover'
    )
    expect(payload.data.sourceTemplateCoverFraming?.card).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    })
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
