// tests/data/exportJson.test.ts
// JSON import/export parsing

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  exportBoardAsJson,
  parseBoardJson,
  parseBoardSnapshotJson,
  parseBoardsJson,
  readBoardImportJsonFile,
} from '~/features/workspace/export/lib/exportJson'
import { stripImagesForShare } from '~/shared/sharing/hashShare'
import {
  BOARD_DATA_VERSION,
  MAX_BOARD_IMPORT_BOARDS,
  MAX_BOARD_IMPORT_JSON_BYTES,
} from '@tierlistbuilder/contracts/workspace/boardEnvelope'
import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import {
  isItemTransformInRange,
  ITEM_TRANSFORM_LIMITS,
  MAX_BOARD_ITEM_LABEL_LEN,
  MAX_BOARD_TITLE_LENGTH,
  MAX_TIER_NAME_LEN,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  MAX_CLOUD_BOARD_TIERS,
  MAX_LARGE_CLOUD_BOARD_ITEMS,
} from '@tierlistbuilder/contracts/workspace/cloudBoard'
import { MAX_IMAGE_BYTE_SIZE } from '@tierlistbuilder/contracts/platform/media'
import { MAX_TEMPLATE_TITLE_LENGTH } from '@tierlistbuilder/contracts/marketplace/template'
import { createPaletteTierColorSpec } from '~/shared/theme/tierColors'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import * as imagePersistence from '~/shared/images/imagePersistence'
import * as imageBlobStore from '~/shared/images/imageBlobStore'
import * as imageDb from '~/shared/images/idb/idbDatabase'
import * as downloadBlobModule from '~/shared/lib/downloadBlob'
import { makeBoardSnapshot, makeItem, makeTier } from '@tests/fixtures'
import { snapshotToCloudPayload } from '~/features/workspace/boards/data/cloud/boardMapper'
import type { BoardImageUploadResult } from '~/features/platform/media/imageUploader'

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

const makeWireTier = (
  index: number,
  overrides: Record<string, unknown> = {}
) => ({
  id: `tier-${index}`,
  name: `Tier ${index}`,
  colorSpec: { kind: 'palette', index: index % 8 },
  itemIds: [],
  ...overrides,
})

const makeWireItem = (
  index: number,
  overrides: Record<string, unknown> = {}
) => ({
  id: `item-${index}`,
  label: `Item ${index}`,
  ...overrides,
})

const emptyUploadResult = (): BoardImageUploadResult => ({
  mediaExternalIdByHash: new Map(),
  mediaExternalIdByItemId: new Map(),
})

afterEach(() =>
{
  vi.restoreAllMocks()
})

describe('readBoardImportJsonFile', () =>
{
  it('rejects oversized files before reading the body', async () =>
  {
    const text = vi.fn(async () => '{}')

    await expect(
      readBoardImportJsonFile({
        size: MAX_BOARD_IMPORT_JSON_BYTES + 1,
        text,
      })
    ).rejects.toThrow('JSON import file is too large')
    expect(text).not.toHaveBeenCalled()
  })

  it('reads files within the import byte cap', async () =>
  {
    const text = vi.fn(async () => '{"ok":true}')

    await expect(
      readBoardImportJsonFile({
        size: MAX_BOARD_IMPORT_JSON_BYTES,
        text,
      })
    ).resolves.toBe('{"ok":true}')
    expect(text).toHaveBeenCalledOnce()
  })
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
    expect(result.items[asItemId('item-1')].label).toBe('First')
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

  it('rejects boards above the tier import cap', async () =>
  {
    const payload = {
      version: BOARD_DATA_VERSION,
      data: {
        tiers: Array.from({ length: MAX_CLOUD_BOARD_TIERS + 1 }, (_, index) =>
          makeWireTier(index)
        ),
        items: {},
      },
    }

    await expect(parseBoardJson(JSON.stringify(payload))).rejects.toThrow(
      `Tier count exceeds import limit of ${MAX_CLOUD_BOARD_TIERS}.`
    )
  })

  it('rejects boards above the item import cap', async () =>
  {
    const payload = {
      version: BOARD_DATA_VERSION,
      data: {
        tiers: [makeWireTier(0)],
        items: Object.fromEntries(
          Array.from(
            { length: MAX_LARGE_CLOUD_BOARD_ITEMS + 1 },
            (_, index) => [`item-${index}`, makeWireItem(index)]
          )
        ),
      },
    }

    await expect(parseBoardJson(JSON.stringify(payload))).rejects.toThrow(
      `Item count exceeds import limit of ${MAX_LARGE_CLOUD_BOARD_ITEMS}.`
    )
  })

  it('rejects boards above the deleted-item import cap', async () =>
  {
    const payload = {
      version: BOARD_DATA_VERSION,
      data: {
        tiers: [makeWireTier(0)],
        items: {},
        deletedItems: Array.from(
          { length: MAX_LARGE_CLOUD_BOARD_ITEMS + 1 },
          (_, index) => makeWireItem(index)
        ),
      },
    }

    await expect(parseBoardJson(JSON.stringify(payload))).rejects.toThrow(
      `Deleted item count exceeds import limit of ${MAX_LARGE_CLOUD_BOARD_ITEMS}.`
    )
  })

  it('rejects boards above the item-reference import cap', async () =>
  {
    const payload = {
      version: BOARD_DATA_VERSION,
      data: {
        tiers: [
          makeWireTier(0, {
            itemIds: Array.from(
              { length: MAX_LARGE_CLOUD_BOARD_ITEMS + 1 },
              (_, index) => `item-${index}`
            ),
          }),
        ],
        items: {},
      },
    }

    await expect(parseBoardJson(JSON.stringify(payload))).rejects.toThrow(
      `Tier "Tier 0" item references exceeds import limit of ${MAX_LARGE_CLOUD_BOARD_ITEMS}.`
    )
  })

  it.each([
    [
      'board title',
      {
        title: 'x'.repeat(MAX_BOARD_TITLE_LENGTH + 1),
        tiers: [makeWireTier(0)],
        items: {},
      },
      `Board title exceeds import limit of ${MAX_BOARD_TITLE_LENGTH} characters.`,
    ],
    [
      'tier name',
      {
        tiers: [makeWireTier(0, { name: 'x'.repeat(MAX_TIER_NAME_LEN + 1) })],
        items: {},
      },
      `Tier "tier-0" name exceeds import limit of ${MAX_TIER_NAME_LEN} characters.`,
    ],
    [
      'item label',
      {
        tiers: [makeWireTier(0)],
        items: {
          'item-1': makeWireItem(1, {
            label: 'x'.repeat(MAX_BOARD_ITEM_LABEL_LEN + 1),
          }),
        },
      },
      `Item "item-1" label exceeds import limit of ${MAX_BOARD_ITEM_LABEL_LEN} characters.`,
    ],
    [
      'source template title',
      {
        tiers: [makeWireTier(0)],
        items: {},
        sourceTemplateTitle: 'x'.repeat(MAX_TEMPLATE_TITLE_LENGTH + 1),
      },
      `sourceTemplateTitle exceeds import limit of ${MAX_TEMPLATE_TITLE_LENGTH} characters.`,
    ],
  ])(
    'rejects oversized import strings (%s)',
    async (_label, data, expected) =>
    {
      await expect(
        parseBoardJson(
          JSON.stringify({
            version: BOARD_DATA_VERSION,
            data,
          })
        )
      ).rejects.toThrow(expected)
    }
  )

  it('rejects inline image payloads above the per-image import cap', async () =>
  {
    const oversizedImageUrl = `data:image/png;base64,${'A'.repeat(
      Math.ceil((MAX_IMAGE_BYTE_SIZE * 4) / 3) + 129
    )}`
    const payload = {
      version: BOARD_DATA_VERSION,
      data: {
        tiers: [makeWireTier(0)],
        items: {
          'item-1': makeWireItem(1, {
            imageUrl: oversizedImageUrl,
          }),
        },
      },
    }

    await expect(parseBoardJson(JSON.stringify(payload))).rejects.toThrow(
      'Item "item-1" imageUrl exceeds import limit'
    )
  })

  it('normalizes imported transforms before cloud sync', async () =>
  {
    const payload = {
      version: BOARD_DATA_VERSION,
      data: {
        tiers: [makeWireTier(0, { itemIds: ['item-1'] })],
        items: {
          'item-1': makeWireItem(1, {
            transform: {
              rotation: 0,
              zoom: 50,
              offsetX: -10,
              offsetY: 10,
            },
          }),
        },
      },
    }

    const imported = await parseBoardJson(JSON.stringify(payload))
    const cloudPayload = snapshotToCloudPayload(imported, emptyUploadResult())
    const transform = cloudPayload.items[0].transform

    expect(transform).toEqual({
      rotation: 0,
      zoom: ITEM_TRANSFORM_LIMITS.zoomMax,
      offsetX: ITEM_TRANSFORM_LIMITS.offsetMin,
      offsetY: ITEM_TRANSFORM_LIMITS.offsetMax,
    })
    expect(transform && isItemTransformInRange(transform)).toBe(true)
  })

  it('drops invalid item background colors at the import finalizer', async () =>
  {
    const payload = {
      version: BOARD_DATA_VERSION,
      data: {
        tiers: [makeWireTier(0, { itemIds: ['item-1'] })],
        items: {
          'item-1': makeWireItem(1, {
            backgroundColor: 'not-a-hex-color',
          }),
        },
      },
    }

    const imported = await parseBoardJson(JSON.stringify(payload))

    expect(imported.items[asItemId('item-1')].label).toBe('Item 1')
    expect(imported.items[asItemId('item-1')].backgroundColor).toBeUndefined()
  })

  it('does not count invalid item background colors as visible content', async () =>
  {
    const payload = {
      version: BOARD_DATA_VERSION,
      data: {
        tiers: [makeWireTier(0)],
        items: {
          'item-1': {
            id: 'item-1',
            backgroundColor: 'not-a-hex-color',
          },
        },
      },
    }

    await expect(parseBoardJson(JSON.stringify(payload))).rejects.toThrow(
      'Item "item-1" has no image, label, or backgroundColor'
    )
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

    expect(result.items[asItemId('item-1')]).toMatchObject({
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
        [asItemId('item-1')]: makeItem({
          id: asItemId('item-1'),
          imageRef: { hash: 'abc' },
          tileImageRef: { hash: 'tile-abc' },
        }),
        [asItemId('item-2')]: makeItem({
          id: asItemId('item-2'),
          label: 'Second',
        }),
      },
    })

    const shared = stripImagesForShare(board)
    expect(
      (shared.items[asItemId('item-1')] as { imageRef?: unknown }).imageRef
    ).toBeUndefined()
    expect(
      (shared.items[asItemId('item-1')] as { tileImageRef?: unknown })
        .tileImageRef
    ).toBeUndefined()
    expect(shared.deletedItems).toHaveLength(0)
  })

  it.each([
    [
      'IDB probe fails',
      () => vi.spyOn(imageDb, 'probeImageStore').mockResolvedValue(false),
      /Image storage is unavailable/i,
    ],
    [
      'persisting inline bytes throws',
      () =>
      {
        vi.spyOn(imageDb, 'probeImageStore').mockResolvedValue(true)
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
    vi.spyOn(imageBlobStore, 'getBlobsBatch').mockResolvedValue(
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
    expect(payload.data.items[asItemId('item-1')]).toMatchObject({
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

  it('rejects multi-board exports above the board import cap', async () =>
  {
    const payload = {
      version: BOARD_DATA_VERSION,
      boards: Array.from({ length: MAX_BOARD_IMPORT_BOARDS + 1 }, () => ({
        title: 'Board',
        data: makeValidBoard(),
      })),
    }

    await expect(parseBoardsJson(JSON.stringify(payload))).rejects.toThrow(
      `Board count exceeds import limit of ${MAX_BOARD_IMPORT_BOARDS}.`
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
    expect(result.items[asItemId('item-1')].label).toBe('First')
  })
})
