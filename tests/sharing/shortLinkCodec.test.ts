// tests/sharing/shortLinkCodec.test.ts
// short-link snapshot codec image policy & size guard

import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  MAX_INFLATED_SNAPSHOT_BYTES,
  MAX_SNAPSHOT_COMPRESSED_BYTES,
} from '@tierlistbuilder/contracts/platform/shortLink'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import {
  assertShortLinkSnapshotSize,
  compressShortLinkSnapshotBytes,
} from '~/shared/sharing/shortLinkCodec'
import { inflateSnapshotBytes } from '~/shared/sharing/hashShare'
import * as imagePersistence from '~/shared/images/imagePersistence'
import * as imageBlobStore from '~/shared/images/imageBlobStore'
import * as imageDb from '~/shared/images/idb/idbDatabase'
import { makeBoardSnapshot, makeItem, makeTier } from '@tests/fixtures'

afterEach(() =>
{
  vi.restoreAllMocks()
})

describe('short-link snapshot codec', () =>
{
  it('preserves live images while dropping deleted items', async () =>
  {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], {
      type: 'image/png',
    })
    const record: imageBlobStore.BlobRecord = {
      hash: 'img-live',
      mimeType: 'image/png',
      byteSize: blob.size,
      createdAt: 1,
      bytes: blob,
    }
    const getBlobsSpy = vi
      .spyOn(imageBlobStore, 'getBlobsBatch')
      .mockResolvedValue(new Map([['img-live', record]]))
    vi.spyOn(imageDb, 'probeImageStore').mockResolvedValue(true)
    vi.spyOn(imagePersistence, 'persistPreparedBlobRecords').mockResolvedValue()

    const board = makeBoardSnapshot({
      title: 'Image Link',
      tiers: [
        makeTier({
          id: 'tier-s',
          itemIds: [asItemId('item-1')],
        }),
      ],
      items: {
        [asItemId('item-1')]: makeItem({
          id: asItemId('item-1'),
          imageRef: { hash: 'img-live' },
        }),
      },
      deletedItems: [
        makeItem({
          id: asItemId('deleted-1'),
          imageRef: { hash: 'img-deleted' },
        }),
      ],
    })

    const compressed = await compressShortLinkSnapshotBytes(board)
    const decoded = await inflateSnapshotBytes(compressed)

    expect(getBlobsSpy).toHaveBeenCalledWith(['img-live'])
    expect(decoded.items[asItemId('item-1')].imageRef).toBeDefined()
    expect(decoded.deletedItems).toEqual([])
  })

  it('strips private notes from short-link payloads', async () =>
  {
    const itemId = asItemId('item-private')
    const board = makeBoardSnapshot({
      title: 'Short Link Notes',
      tiers: [
        makeTier({
          id: 'tier-s',
          itemIds: [itemId],
        }),
      ],
      items: {
        [itemId]: makeItem({
          id: itemId,
          label: 'Visible label',
          notes: 'Only I should see this',
        }),
      },
    })

    const compressed = await compressShortLinkSnapshotBytes(board)
    const decoded = await inflateSnapshotBytes(compressed)

    expect(decoded.items[itemId]).not.toHaveProperty('notes')
  })

  it('rejects oversized compressed snapshots before upload', () =>
  {
    expect(() =>
      assertShortLinkSnapshotSize(MAX_SNAPSHOT_COMPRESSED_BYTES + 1)
    ).toThrow('share snapshot exceeds')
  })

  it('rejects oversized inline image candidates before data-url encoding', async () =>
  {
    const tinyBlob = new Blob(['x'], { type: 'image/png' })
    vi.spyOn(imageBlobStore, 'getBlobsBatch').mockResolvedValue(
      new Map([
        [
          'img-huge',
          {
            hash: 'img-huge',
            mimeType: tinyBlob.type,
            byteSize: MAX_INFLATED_SNAPSHOT_BYTES,
            createdAt: 1,
            bytes: tinyBlob,
          },
        ],
      ])
    )

    const board = makeBoardSnapshot({
      tiers: [
        makeTier({
          id: 'tier-s',
          itemIds: [asItemId('item-1')],
        }),
      ],
      items: {
        [asItemId('item-1')]: makeItem({
          id: asItemId('item-1'),
          imageRef: { hash: 'img-huge' },
        }),
      },
    })

    await expect(compressShortLinkSnapshotBytes(board)).rejects.toThrow(
      'preflight cap'
    )
  })
})
