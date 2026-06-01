// tests/cloud-sync/cloudBoardMapper.test.ts
// cloud board <-> snapshot mapping invariants

import { describe, expect, it } from 'vitest'
import type {
  BoardSnapshot,
  ItemTransform,
} from '@tierlistbuilder/contracts/workspace/board'
import type {
  CloudBoardPayload,
  CloudBoardState,
} from '@tierlistbuilder/contracts/workspace/cloudBoard'
import { asItemId, type ItemId } from '@tierlistbuilder/contracts/lib/ids'
import {
  serverStateToSnapshot,
  snapshotToCloudPayload,
} from '~/features/workspace/boards/data/cloud/boardMapper'
import { normalizeBoardSnapshot } from '~/shared/board-data/boardSnapshot'
import type { BoardImageUploadResult } from '~/features/platform/media/imageUploader'
import { makeBoardSnapshot, makeTier } from '@tests/fixtures'

const makeBoardWithItem = (
  item: BoardSnapshot['items'][ItemId]
): BoardSnapshot =>
{
  const itemId = asItemId('item-1')
  return makeBoardSnapshot({
    tiers: [makeTier({ id: 'tier-s', itemIds: [itemId] })],
    items: { [itemId]: { ...item, id: itemId } },
  })
}

const emptyUploadResult = (): BoardImageUploadResult => ({
  mediaExternalIdByHash: new Map(),
  mediaExternalIdByItemId: new Map(),
})

const payloadToCloudState = (payload: CloudBoardPayload): CloudBoardState =>
{
  const deletedItemIds = new Set(payload.deletedItemIds)
  return {
    title: payload.title,
    revision: 1,
    itemAspectRatio: payload.itemAspectRatio,
    itemAspectRatioMode: payload.itemAspectRatioMode,
    aspectRatioPromptDismissed: payload.aspectRatioPromptDismissed,
    defaultItemImageFit: payload.defaultItemImageFit,
    defaultItemImagePadding: payload.defaultItemImagePadding,
    paletteId: payload.paletteId,
    textStyleId: payload.textStyleId,
    pageBackground: payload.pageBackground,
    labels: payload.labels,
    autoPlate: payload.autoPlate,
    sourceTemplateId: payload.sourceTemplateId ?? null,
    sourceRankingId: payload.sourceRankingId ?? null,
    sourceTemplateTitle: payload.sourceTemplateTitle ?? null,
    sourceRankingTitle: payload.sourceRankingTitle ?? null,
    preferredCriterionExternalId: payload.preferredCriterionExternalId ?? null,
    tiers: payload.tiers.map((tier, order) => ({ ...tier, order })),
    items: payload.items.map((item) => ({
      ...item,
      deletedAt: deletedItemIds.has(item.externalId) ? 100 : null,
    })),
  }
}

describe('snapshotToCloudPayload', () =>
{
  it('selects validated upload results -> null for media refs', () =>
  {
    const fresh = snapshotToCloudPayload(
      makeBoardWithItem({
        id: asItemId('item-1'),
        imageRef: { hash: 'hash-1', cloudMediaExternalId: 'media-old' },
      }),
      {
        ...emptyUploadResult(),
        mediaExternalIdByHash: new Map([['hash-1', 'media-new']]),
      }
    )
    expect(fresh.items[0].mediaExternalId).toBe('media-new')

    const reused = snapshotToCloudPayload(
      makeBoardWithItem({
        id: asItemId('item-1'),
        imageRef: { hash: 'hash-1', cloudMediaExternalId: 'media-existing' },
      }),
      {
        ...emptyUploadResult(),
        mediaExternalIdByHash: new Map([['hash-1', 'media-existing']]),
      }
    )
    expect(reused.items[0].mediaExternalId).toBe('media-existing')

    expect(() =>
      snapshotToCloudPayload(
        makeBoardWithItem({
          id: asItemId('item-1'),
          imageRef: { hash: 'hash-1', cloudMediaExternalId: 'media-stale' },
        }),
        emptyUploadResult()
      )
    ).toThrow('Unable to sync image')

    const copied = snapshotToCloudPayload(
      makeBoardWithItem({
        id: asItemId('item-1'),
        imageRef: {
          hash: 'hash-1',
          cloudMediaExternalId: 'media-marketplace',
          cloudMediaOwnership: 'source',
        },
      }),
      {
        ...emptyUploadResult(),
        mediaExternalIdByHash: new Map([['hash-1', 'media-copy']]),
      }
    )
    expect(copied.items[0].mediaExternalId).toBe('media-copy')

    const cleared = snapshotToCloudPayload(
      makeBoardWithItem({ id: asItemId('item-1'), label: 'Text only' }),
      emptyUploadResult()
    )
    expect(cleared.items[0].mediaExternalId).toBeNull()

    expect(() =>
      snapshotToCloudPayload(
        makeBoardWithItem({
          id: asItemId('item-1'),
          imageRef: { hash: 'hash-1' },
        }),
        emptyUploadResult()
      )
    ).toThrow('Unable to sync image')

    expect(() =>
      snapshotToCloudPayload(
        makeBoardWithItem({
          id: asItemId('item-1'),
          imageRef: {
            hash: 'hash-1',
            cloudMediaExternalId: 'media-marketplace',
            cloudMediaOwnership: 'source',
          },
        }),
        emptyUploadResult()
      )
    ).toThrow('Unable to sync image')
  })

  it('preserves board style, aspect, transforms, & deleted-item sentinel order', () =>
  {
    const tieredId = asItemId('item-tiered')
    const unrankedId = asItemId('item-unranked')
    const deletedId = asItemId('item-deleted')
    const transforms = {
      [tieredId]: { rotation: 90, zoom: 1.5, offsetX: 0.2, offsetY: -0.3 },
      [unrankedId]: { rotation: 180, zoom: 2, offsetX: -0.1, offsetY: 0.4 },
      [deletedId]: { rotation: 270, zoom: 0.75, offsetX: 0, offsetY: 0.1 },
    } satisfies Record<string, ItemTransform>

    const payload = snapshotToCloudPayload(
      makeBoardSnapshot({
        itemAspectRatio: 16 / 9,
        itemAspectRatioMode: 'manual',
        defaultItemImageFit: 'contain',
        paletteId: 'twilight',
        textStyleId: 'rounded',
        pageBackground: '#123456',
        sourceTemplateId: 'Template123',
        sourceTemplateTitle: 'Template',
        preferredCriterionExternalId: 'favorites',
        tiers: [makeTier({ id: 'tier-s', itemIds: [tieredId] })],
        unrankedItemIds: [unrankedId],
        items: {
          [tieredId]: {
            id: tieredId,
            label: 'Tiered',
            aspectRatio: 4 / 3,
            imageFit: 'contain',
            transform: transforms[tieredId],
            sourceTemplateItemExternalId: 'template-item-1',
          },
          [unrankedId]: {
            id: unrankedId,
            label: 'Unranked',
            transform: transforms[unrankedId],
          },
        },
        deletedItems: [
          {
            id: deletedId,
            label: 'Deleted',
            transform: transforms[deletedId],
          },
        ],
      }),
      emptyUploadResult()
    )

    expect(payload).toMatchObject({
      itemAspectRatio: 16 / 9,
      itemAspectRatioMode: 'manual',
      defaultItemImageFit: 'contain',
      paletteId: 'twilight',
      textStyleId: 'rounded',
      pageBackground: '#123456',
      sourceTemplateId: 'Template123',
      sourceTemplateTitle: 'Template',
      preferredCriterionExternalId: 'favorites',
    })
    const tiered = payload.items.find((i) => i.externalId === tieredId)
    expect(tiered).toMatchObject({
      aspectRatio: 4 / 3,
      imageFit: 'contain',
      sourceTemplateItemExternalId: 'template-item-1',
    })
    for (const [id, expected] of Object.entries(transforms))
    {
      expect(payload.items.find((i) => i.externalId === id)?.transform).toEqual(
        expected
      )
    }
    expect(payload.items.find((i) => i.externalId === deletedId)?.order).toBe(
      -1
    )
  })
})

describe('serverStateToSnapshot', () =>
{
  it('roundtrips imported scalar fields through cloud payload/state mapping', () =>
  {
    const tieredId = asItemId('item-tiered')
    const unrankedId = asItemId('item-unranked')
    const deletedId = asItemId('item-deleted')
    const snapshot = makeBoardSnapshot({
      title: 'Roundtrip Board',
      itemAspectRatio: 16 / 9,
      itemAspectRatioMode: 'manual',
      aspectRatioPromptDismissed: true,
      defaultItemImageFit: 'contain',
      defaultItemImagePadding: 0.12,
      paletteId: 'twilight',
      textStyleId: 'rounded',
      pageBackground: '#123456',
      labels: {
        show: true,
        placement: { mode: 'overlay', x: 0.25, y: 0.75 },
        scrim: 'dark',
        fontSizePx: 18,
        textStyleId: 'mono',
        textColor: 'white',
      },
      autoPlate: { mode: 'uniform', uniformColor: '#abcdef' },
      sourceTemplateId: 'template-slug',
      sourceRankingId: 'ranking-slug',
      sourceTemplateTitle: 'Template',
      sourceRankingTitle: 'Ranking',
      preferredCriterionExternalId: 'criterion-1',
      tiers: [makeTier({ id: 'tier-s', itemIds: [tieredId] })],
      unrankedItemIds: [unrankedId],
      items: {
        [tieredId]: {
          id: tieredId,
          label: 'Tiered',
          backgroundColor: '#334455',
          mediaPlate: 'light',
          altText: 'Tiered alt',
          notes: 'Tiered note',
          aspectRatio: 4 / 3,
          imageFit: 'contain',
          transform: { rotation: 90, zoom: 1.5, offsetX: 0.1, offsetY: -0.2 },
          imagePadding: 0.08,
          labelOptions: {
            visible: true,
            placement: { mode: 'captionBelow' },
            fontSizePx: 16,
            textColor: 'black',
          },
          sourceTemplateItemExternalId: 'template-item-1',
        },
        [unrankedId]: {
          id: unrankedId,
          label: 'Unranked',
          notes: 'Unranked note',
        },
      },
      deletedItems: [
        {
          id: deletedId,
          label: 'Deleted',
          backgroundColor: '#445566',
          notes: 'Deleted note',
        },
      ],
    })

    const payload = snapshotToCloudPayload(snapshot, emptyUploadResult())
    const pulled = serverStateToSnapshot(payloadToCloudState(payload))

    expect(pulled).toEqual(normalizeBoardSnapshot(snapshot, 'twilight'))
  })

  it('restores image refs (preview + tile + source) & board style overrides from cloud state', () =>
  {
    const itemId = asItemId('item-1')
    const snapshot = serverStateToSnapshot({
      title: 'Board',
      revision: 3,
      tiers: [],
      items: [
        {
          externalId: itemId,
          tierId: null,
          mediaExternalId: 'media-1',
          previewMediaContentHash: 'preview-hash',
          mediaContentHash: 'tile-hash',
          sourceMediaContentHash: 'source-hash',
          sourceTemplateItemExternalId: 'template-item-1',
          order: 0,
          deletedAt: null,
        },
      ],
      paletteId: 'twilight',
      textStyleId: 'rounded',
      pageBackground: '#123456',
      preferredCriterionExternalId: 'favorites',
    })

    expect(snapshot.items[itemId].imageRef).toEqual({
      hash: 'preview-hash',
      cloudMediaExternalId: 'media-1',
    })
    expect(snapshot.items[itemId].tileImageRef).toEqual({
      hash: 'tile-hash',
      cloudMediaExternalId: 'media-1',
    })
    expect(snapshot.items[itemId].sourceImageRef).toEqual({
      hash: 'source-hash',
      cloudMediaExternalId: 'media-1',
    })
    expect(snapshot.items[itemId].sourceTemplateItemExternalId).toBe(
      'template-item-1'
    )
    expect(snapshot).toMatchObject({
      paletteId: 'twilight',
      textStyleId: 'rounded',
      pageBackground: '#123456',
      preferredCriterionExternalId: 'favorites',
    })
  })

  it('keeps soft-deleted cloud items out of the live item map', () =>
  {
    const activeId = asItemId('item-active')
    const deletedId = asItemId('item-deleted')

    const snapshot = serverStateToSnapshot({
      title: 'Board',
      revision: 4,
      tiers: [
        {
          externalId: 'tier-a',
          name: 'A',
          colorSpec: { kind: 'palette', index: 0 },
          order: 0,
          itemIds: [activeId],
        },
      ],
      items: [
        {
          externalId: activeId,
          tierId: 'tier-a',
          label: 'Active',
          order: 0,
          deletedAt: null,
        },
        {
          externalId: deletedId,
          tierId: null,
          label: 'Deleted',
          notes: 'Trash note',
          order: -1,
          deletedAt: 200,
        },
      ],
    })

    expect(snapshot.items[activeId]?.label).toBe('Active')
    expect(snapshot.items[deletedId]).toBeUndefined()
    expect(snapshot.deletedItems).toEqual([
      expect.objectContaining({
        id: deletedId,
        label: 'Deleted',
        notes: 'Trash note',
      }),
    ])
  })

  it('finalizes cloud state through snapshot normalization', () =>
  {
    const itemId = asItemId('item-1')
    const snapshot = serverStateToSnapshot({
      title: 'Board',
      revision: 5,
      tiers: [
        {
          externalId: 'tier-s',
          name: 'S',
          colorSpec: { kind: 'palette', index: 0 },
          order: 0,
          itemIds: [itemId],
        },
      ],
      items: [
        {
          externalId: itemId,
          tierId: 'tier-s',
          label: 'Invalid color survives as text',
          backgroundColor: 'not-a-hex-color',
          order: 0,
          deletedAt: null,
        },
      ],
      pageBackground: 'not-a-hex-color',
    })

    expect(snapshot.pageBackground).toBeUndefined()
    expect(snapshot.items[itemId]).toMatchObject({
      label: 'Invalid color survives as text',
    })
    expect(snapshot.items[itemId].backgroundColor).toBeUndefined()
  })
})
