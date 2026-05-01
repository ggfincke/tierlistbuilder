// tests/data/cloudBoardMapper.test.ts
// cloud board <-> snapshot mapping invariants

import { describe, expect, it } from 'vitest'
import type {
  BoardSnapshot,
  ItemTransform,
} from '@tierlistbuilder/contracts/workspace/board'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import {
  serverStateToSnapshot,
  snapshotToCloudPayload,
} from '~/features/workspace/boards/data/cloud/boardMapper'
import type { BoardImageUploadResult } from '~/features/platform/media/imageUploader'
import { makeBoardSnapshot, makeTier } from '../fixtures'

const makeBoardWithItem = (
  item: BoardSnapshot['items'][string]
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

describe('snapshotToCloudPayload', () =>
{
  it('selects upload-result -> existing-cloud-id -> null for media refs', () =>
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

    const fallback = snapshotToCloudPayload(
      makeBoardWithItem({
        id: asItemId('item-1'),
        imageRef: { hash: 'hash-1', cloudMediaExternalId: 'media-existing' },
      }),
      emptyUploadResult()
    )
    expect(fallback.items[0].mediaExternalId).toBe('media-existing')

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
        tiers: [makeTier({ id: 'tier-s', itemIds: [tieredId] })],
        unrankedItemIds: [unrankedId],
        items: {
          [tieredId]: {
            id: tieredId,
            label: 'Tiered',
            aspectRatio: 4 / 3,
            imageFit: 'contain',
            transform: transforms[tieredId],
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
    })
    const tiered = payload.items.find((i) => i.externalId === tieredId)
    expect(tiered).toMatchObject({ aspectRatio: 4 / 3, imageFit: 'contain' })
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
  it('restores image refs (display + source) & board style overrides from cloud state', () =>
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
          mediaContentHash: 'display-hash',
          sourceMediaContentHash: 'source-hash',
          order: 0,
          deletedAt: null,
        },
      ],
      paletteId: 'twilight',
      textStyleId: 'rounded',
      pageBackground: '#123456',
    })

    expect(snapshot.items[itemId].imageRef).toEqual({
      hash: 'display-hash',
      cloudMediaExternalId: 'media-1',
    })
    expect(snapshot.items[itemId].sourceImageRef).toEqual({
      hash: 'source-hash',
      cloudMediaExternalId: 'media-1',
    })
    expect(snapshot).toMatchObject({
      paletteId: 'twilight',
      textStyleId: 'rounded',
      pageBackground: '#123456',
    })
  })
})
