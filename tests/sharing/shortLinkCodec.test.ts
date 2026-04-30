// tests/sharing/shortLinkCodec.test.ts
// short-link snapshot codec image policy & size guard

import { describe, expect, it, vi, afterEach } from 'vitest'
import { MAX_SNAPSHOT_COMPRESSED_BYTES } from '@tierlistbuilder/contracts/platform/shortLink'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import {
  assertShortLinkSnapshotSize,
  compressShortLinkSnapshotBytes,
} from '~/shared/sharing/shortLinkCodec'
import { inflateSnapshotBytes } from '~/shared/sharing/hashShare'
import * as imagePersistence from '~/shared/images/imagePersistence'
import * as imageStore from '~/shared/images/imageStore'
import { makeBoardSnapshot, makeItem, makeTier } from '../fixtures'

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
    const record: imageStore.BlobRecord = {
      hash: 'img-live',
      mimeType: 'image/png',
      byteSize: blob.size,
      createdAt: 1,
      bytes: blob,
    }
    const getBlobsSpy = vi
      .spyOn(imageStore, 'getBlobsBatch')
      .mockResolvedValue(new Map([['img-live', record]]))
    vi.spyOn(imageStore, 'probeImageStore').mockResolvedValue(true)
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
    expect(decoded.items['item-1'].imageRef).toBeDefined()
    expect(decoded.deletedItems).toEqual([])
  })

  it('rejects oversized compressed snapshots before upload', () =>
  {
    expect(() =>
      assertShortLinkSnapshotSize(MAX_SNAPSHOT_COMPRESSED_BYTES + 1)
    ).toThrow('share snapshot exceeds')
  })
})
