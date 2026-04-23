// tests/data/cloudBoardMapper.test.ts
// cloud board <-> snapshot mapping

import { describe, expect, it } from 'vitest'
import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import { snapshotToCloudPayload } from '~/features/workspace/boards/data/cloud/boardMapper'
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
})
