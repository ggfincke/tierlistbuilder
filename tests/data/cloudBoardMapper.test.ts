// tests/data/cloudBoardMapper.test.ts
// cloud board <-> snapshot mapping

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
    title: 'Board',
    tiers: [makeTier({ id: 'tier-s', name: 'S', itemIds: [itemId] })],
    items: {
      [itemId]: {
        ...item,
        id: itemId,
      },
    },
  })
}

const emptyUploadResult = (): BoardImageUploadResult => ({
  mediaExternalIdByHash: new Map(),
})

describe('snapshotToCloudPayload media mapping', () =>
{
  it('prefers a freshly uploaded mediaExternalId when present', () =>
  {
    const payload = snapshotToCloudPayload(
      makeBoardWithItem({
        id: asItemId('item-1'),
        imageRef: {
          hash: 'hash-1',
          cloudMediaExternalId: 'media-old',
        },
      }),
      {
        ...emptyUploadResult(),
        mediaExternalIdByHash: new Map([['hash-1', 'media-new']]),
      }
    )

    expect(payload.items[0].mediaExternalId).toBe('media-new')
  })

  it('falls back to the existing cloud media id when upload resolution is missing', () =>
  {
    const payload = snapshotToCloudPayload(
      makeBoardWithItem({
        id: asItemId('item-1'),
        imageRef: {
          hash: 'hash-1',
          cloudMediaExternalId: 'media-existing',
        },
      }),
      emptyUploadResult()
    )

    expect(payload.items[0].mediaExternalId).toBe('media-existing')
  })

  it('maps source image refs separately from display image refs', () =>
  {
    const payload = snapshotToCloudPayload(
      makeBoardWithItem({
        id: asItemId('item-1'),
        imageRef: { hash: 'display-hash' },
        sourceImageRef: { hash: 'source-hash' },
      }),
      {
        ...emptyUploadResult(),
        mediaExternalIdByHash: new Map([
          ['display-hash', 'media-display'],
          ['source-hash', 'media-source'],
        ]),
      }
    )

    expect(payload.items[0]).toMatchObject({
      mediaExternalId: 'media-display',
      sourceMediaExternalId: 'media-source',
    })
  })

  it('throws when a hash-backed image has no upload mapping or cloud id', () =>
  {
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

  it('sends an explicit media clear when an item has no image', () =>
  {
    const payload = snapshotToCloudPayload(
      makeBoardWithItem({
        id: asItemId('item-1'),
        label: 'Text only',
      }),
      emptyUploadResult()
    )

    expect(payload.items[0].mediaExternalId).toBeNull()
    expect(payload.items[0].sourceMediaExternalId).toBeNull()
  })

  it('uses the deleted-item sentinel order', () =>
  {
    const itemId = asItemId('item-deleted')
    const payload = snapshotToCloudPayload(
      makeBoardSnapshot({
        title: 'Board',
        deletedItems: [
          {
            id: itemId,
            label: 'Deleted',
          },
        ],
      }),
      emptyUploadResult()
    )

    expect(payload.items[0].order).toBe(-1)
  })

  it('preserves board and item aspect settings in the cloud payload', () =>
  {
    const itemId = asItemId('item-1')
    const payload = snapshotToCloudPayload(
      makeBoardSnapshot({
        title: 'Board',
        itemAspectRatio: 16 / 9,
        itemAspectRatioMode: 'manual',
        aspectRatioPromptDismissed: true,
        defaultItemImageFit: 'contain',
        tiers: [makeTier({ id: 'tier-s', name: 'S', itemIds: [itemId] })],
        items: {
          [itemId]: {
            id: itemId,
            label: 'Wide item',
            aspectRatio: 4 / 3,
            imageFit: 'contain',
          },
        },
      }),
      emptyUploadResult()
    )

    expect(payload).toMatchObject({
      itemAspectRatio: 16 / 9,
      itemAspectRatioMode: 'manual',
      aspectRatioPromptDismissed: true,
      defaultItemImageFit: 'contain',
    })
    expect(payload.items[0]).toMatchObject({
      aspectRatio: 4 / 3,
      imageFit: 'contain',
    })
  })

  it('preserves item transforms across all cloud payload item groups', () =>
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
        title: 'Board',
        tiers: [makeTier({ id: 'tier-s', name: 'S', itemIds: [tieredId] })],
        unrankedItemIds: [unrankedId],
        items: {
          [tieredId]: {
            id: tieredId,
            label: 'Tiered',
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

    for (const [id, expected] of Object.entries(transforms))
    {
      expect(
        payload.items.find((item) => item.externalId === id)?.transform
      ).toEqual(expected)
    }
  })
})

describe('serverStateToSnapshot media mapping', () =>
{
  it('restores display and source image refs from cloud media fields', () =>
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
          mediaExternalId: 'media-display',
          sourceMediaExternalId: 'media-source',
          mediaContentHash: 'display-hash',
          sourceMediaContentHash: 'source-hash',
          order: 0,
          deletedAt: null,
        },
      ],
    })

    expect(snapshot.items[itemId].imageRef).toEqual({
      hash: 'display-hash',
      cloudMediaExternalId: 'media-display',
    })
    expect(snapshot.items[itemId].sourceImageRef).toEqual({
      hash: 'source-hash',
      cloudMediaExternalId: 'media-source',
    })
  })
})
