// tests/data/imageUploader.test.ts
// cloud media upload planning & rate-limit propagation

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConvexError } from 'convex/values'
import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { uploadBoardImages } from '~/features/platform/media/imageUploader'
import {
  getBlobsBatch,
  getUploadStatusBatch,
  markUploaded,
} from '~/shared/images/imageStore'
import {
  finalizeUploadVariantsImperative,
  generateUploadUrlsImperative,
  uploadEnvelopedBlob,
} from '~/features/platform/media/uploadsRepository'
import { PermanentSyncError } from '~/features/platform/sync/lib/errors'
import { makeBoardSnapshot, makeItem } from '../fixtures'

vi.mock('~/features/platform/media/uploadsRepository', () => ({
  generateUploadUrlsImperative: vi.fn(),
  finalizeUploadVariantsImperative: vi.fn(),
  uploadEnvelopedBlob: vi.fn(),
}))

vi.mock('~/shared/images/imageStore', () => ({
  getBlobsBatch: vi.fn(),
  getUploadStatusBatch: vi.fn(),
  markUploaded: vi.fn(),
}))

const makeImageBoard = (
  imageRef: NonNullable<BoardSnapshot['items'][string]['imageRef']>,
  sourceImageRef?: NonNullable<BoardSnapshot['items'][string]['sourceImageRef']>
): BoardSnapshot =>
{
  const itemId = asItemId('item-1')
  return makeBoardSnapshot({
    items: {
      [itemId]: makeItem({ id: itemId, imageRef, sourceImageRef }),
    },
  })
}

const makeLocalBlobRecord = (hash: string) => ({
  hash,
  mimeType: 'image/png',
  byteSize: 4,
  createdAt: 1,
  bytes: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }),
})

describe('uploadBoardImages', () =>
{
  beforeEach(() =>
  {
    vi.mocked(getBlobsBatch).mockResolvedValue(new Map())
    vi.mocked(getUploadStatusBatch).mockResolvedValue(new Map())
    vi.mocked(markUploaded).mockResolvedValue()
  })

  it('reuses cloud media ids without re-uploading & throws when local blob is missing', async () =>
  {
    const reused = await uploadBoardImages(
      makeImageBoard({
        hash: 'hash-from-cloud',
        cloudMediaExternalId: 'media-existing',
      }),
      'user-1'
    )
    expect(reused.mediaExternalIdByHash.get('hash-from-cloud')).toBe(
      'media-existing'
    )

    await expect(
      uploadBoardImages(makeImageBoard({ hash: 'local-only' }), 'user-1')
    ).rejects.toBeInstanceOf(PermanentSyncError)
  })

  it('uploads blobs via the envelope helper using a single batched URL request', async () =>
  {
    const uploadToken = 'a'.repeat(64)
    const envelopeUserId = 'server-user-1'
    const record = makeLocalBlobRecord('hash-1')
    vi.mocked(getBlobsBatch).mockResolvedValue(new Map([[record.hash, record]]))
    vi.mocked(generateUploadUrlsImperative).mockResolvedValue({
      envelopeUserId,
      urls: [{ uploadUrl: 'https://uploads.example.test', uploadToken }],
    })
    vi.mocked(uploadEnvelopedBlob).mockResolvedValue(
      'storage-1' as unknown as never
    )
    vi.mocked(finalizeUploadVariantsImperative).mockResolvedValue({
      externalId: 'media-1',
    })

    const result = await uploadBoardImages(
      makeImageBoard({ hash: record.hash }),
      'local-user-1'
    )
    expect(generateUploadUrlsImperative).toHaveBeenCalledWith(1)
    expect(uploadEnvelopedBlob).toHaveBeenCalledWith({
      uploadUrl: 'https://uploads.example.test',
      uploadToken,
      envelopeUserId,
      blob: expect.any(Blob),
    })
    expect(result.mediaExternalIdByHash.get(record.hash)).toBe('media-1')
    expect(markUploaded).toHaveBeenCalledWith(
      'local-user-1',
      'media:hash-1:',
      'media-1'
    )
  })

  it('uploads source refs as editor variants under the display media asset', async () =>
  {
    const tileToken = 'b'.repeat(64)
    const editorToken = 'c'.repeat(64)
    const display = makeLocalBlobRecord('display-hash')
    const source = makeLocalBlobRecord('source-hash')
    vi.mocked(getBlobsBatch).mockResolvedValue(
      new Map([
        [display.hash, display],
        [source.hash, source],
      ])
    )
    vi.mocked(generateUploadUrlsImperative).mockResolvedValue({
      envelopeUserId: 'server-user-1',
      urls: [
        {
          uploadUrl: 'https://uploads.example.test/tile',
          uploadToken: tileToken,
        },
        {
          uploadUrl: 'https://uploads.example.test/editor',
          uploadToken: editorToken,
        },
      ],
    })
    vi.mocked(uploadEnvelopedBlob).mockResolvedValue(
      'storage-1' as unknown as never
    )
    vi.mocked(finalizeUploadVariantsImperative).mockResolvedValueOnce({
      externalId: 'media-1',
    })

    const both = await uploadBoardImages(
      makeImageBoard({ hash: display.hash }, { hash: source.hash }),
      'user-1'
    )
    expect(generateUploadUrlsImperative).toHaveBeenCalledWith(2)
    expect(both.mediaExternalIdByHash.get(display.hash)).toBe('media-1')
    expect(both.mediaExternalIdByHash.get(source.hash)).toBe('media-1')
    expect(both.mediaExternalIdByItemId.get('item-1')).toBe('media-1')
    expect(markUploaded).toHaveBeenCalledWith(
      'user-1',
      'media:display-hash:source-hash',
      'media-1'
    )
    expect(finalizeUploadVariantsImperative).toHaveBeenCalledWith({
      variants: [
        {
          kind: 'tile',
          storageId: 'storage-1',
          uploadToken: tileToken,
        },
        {
          kind: 'editor',
          storageId: 'storage-1',
          uploadToken: editorToken,
        },
      ],
    })

    vi.clearAllMocks()
    vi.mocked(getBlobsBatch).mockResolvedValue(
      new Map([[display.hash, display]])
    )
    vi.mocked(generateUploadUrlsImperative).mockResolvedValue({
      envelopeUserId: 'server-user-1',
      urls: [
        {
          uploadUrl: 'https://uploads.example.test/tile',
          uploadToken: tileToken,
        },
      ],
    })
    vi.mocked(finalizeUploadVariantsImperative).mockResolvedValue({
      externalId: 'media-display',
    })

    const reusedSource = await uploadBoardImages(
      makeImageBoard(
        { hash: display.hash, cloudMediaExternalId: 'media-display' },
        { hash: 'cloud-source', cloudMediaExternalId: 'media-display' }
      ),
      'user-1'
    )
    expect(reusedSource.mediaExternalIdByHash.get(display.hash)).toBe(
      'media-display'
    )
    expect(reusedSource.mediaExternalIdByHash.get('cloud-source')).toBe(
      'media-display'
    )
    expect(getBlobsBatch).toHaveBeenCalledWith([])
  })

  it('keeps editor assets distinct when multiple items share a display hash', async () =>
  {
    const display = makeLocalBlobRecord('display-same')
    const sourceA = makeLocalBlobRecord('source-a')
    const sourceB = makeLocalBlobRecord('source-b')
    vi.mocked(getBlobsBatch).mockResolvedValue(
      new Map([
        [display.hash, display],
        [sourceA.hash, sourceA],
        [sourceB.hash, sourceB],
      ])
    )
    vi.mocked(generateUploadUrlsImperative).mockResolvedValue({
      envelopeUserId: 'server-user-1',
      urls: [
        { uploadUrl: 'https://uploads.example.test/tile', uploadToken: 'tile' },
        {
          uploadUrl: 'https://uploads.example.test/editor',
          uploadToken: 'editor',
        },
      ],
    })
    vi.mocked(uploadEnvelopedBlob)
      .mockResolvedValueOnce('storage-tile-a' as unknown as never)
      .mockResolvedValueOnce('storage-source-a' as unknown as never)
      .mockResolvedValueOnce('storage-tile-b' as unknown as never)
      .mockResolvedValueOnce('storage-source-b' as unknown as never)
    vi.mocked(finalizeUploadVariantsImperative)
      .mockResolvedValueOnce({ externalId: 'media-a' })
      .mockResolvedValueOnce({ externalId: 'media-b' })

    const itemA = asItemId('item-a')
    const itemB = asItemId('item-b')
    const result = await uploadBoardImages(
      makeBoardSnapshot({
        unrankedItemIds: [itemA, itemB],
        items: {
          [itemA]: makeItem({
            id: itemA,
            imageRef: { hash: display.hash },
            sourceImageRef: { hash: sourceA.hash },
          }),
          [itemB]: makeItem({
            id: itemB,
            imageRef: { hash: display.hash },
            sourceImageRef: { hash: sourceB.hash },
          }),
        },
      }),
      'user-1'
    )

    expect(finalizeUploadVariantsImperative).toHaveBeenCalledTimes(2)
    expect(result.mediaExternalIdByItemId.get(itemA)).toBe('media-a')
    expect(result.mediaExternalIdByItemId.get(itemB)).toBe('media-b')
    expect(markUploaded).toHaveBeenCalledWith(
      'user-1',
      'media:display-same:source-a',
      'media-a'
    )
    expect(markUploaded).toHaveBeenCalledWith(
      'user-1',
      'media:display-same:source-b',
      'media-b'
    )
  })

  it('rethrows rate limits instead of aggregating them as upload failures', async () =>
  {
    const rateLimited = new ConvexError({
      code: CONVEX_ERROR_CODES.rateLimited,
      retryAfter: 12_000,
    })
    const record = makeLocalBlobRecord('hash-1')
    vi.mocked(getBlobsBatch).mockResolvedValue(new Map([[record.hash, record]]))
    vi.mocked(generateUploadUrlsImperative).mockRejectedValue(rateLimited)

    await expect(
      uploadBoardImages(makeImageBoard({ hash: record.hash }), 'user-1')
    ).rejects.toBe(rateLimited)
    expect(finalizeUploadVariantsImperative).not.toHaveBeenCalled()
  })
})
