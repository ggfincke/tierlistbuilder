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
  getReusableMediaExternalIdsImperative,
  uploadEnvelopedBlob,
} from '~/features/platform/media/uploadsRepository'
import { PermanentSyncError } from '~/features/platform/sync/lib/errors'
import { makeBoardSnapshot, makeItem } from '../fixtures'

vi.mock('~/features/platform/media/uploadsRepository', () => ({
  generateUploadUrlsImperative: vi.fn(),
  finalizeUploadVariantsImperative: vi.fn(),
  getReusableMediaExternalIdsImperative: vi.fn(),
  uploadEnvelopedBlob: vi.fn(),
}))

vi.mock('~/shared/images/imageStore', () => ({
  getBlobsBatch: vi.fn(),
  getUploadStatusBatch: vi.fn(),
  markUploaded: vi.fn(),
}))

const makeImageBoard = (
  imageRef: NonNullable<BoardSnapshot['items'][string]['imageRef']>,
  tileImageRef?: NonNullable<BoardSnapshot['items'][string]['tileImageRef']>,
  sourceImageRef?: NonNullable<BoardSnapshot['items'][string]['sourceImageRef']>
): BoardSnapshot =>
{
  const itemId = asItemId('item-1')
  return makeBoardSnapshot({
    items: {
      [itemId]: makeItem({
        id: itemId,
        imageRef,
        tileImageRef,
        sourceImageRef,
      }),
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
    vi.mocked(getReusableMediaExternalIdsImperative).mockImplementation(
      async ({ externalIds }) => externalIds.map(() => true)
    )
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

  it('uploads a user-owned copy for source-owned marketplace media refs', async () =>
  {
    const record = makeLocalBlobRecord('marketplace-hash')
    vi.mocked(getBlobsBatch).mockResolvedValue(new Map([[record.hash, record]]))
    vi.mocked(generateUploadUrlsImperative).mockResolvedValue({
      envelopeUserId: 'server-user-1',
      urls: [
        { uploadUrl: 'https://uploads.example.test/tile', uploadToken: 'tile' },
        {
          uploadUrl: 'https://uploads.example.test/preview',
          uploadToken: 'preview',
        },
      ],
    })
    vi.mocked(uploadEnvelopedBlob).mockResolvedValue(
      'storage-1' as unknown as never
    )
    vi.mocked(finalizeUploadVariantsImperative).mockResolvedValue({
      externalId: 'media-user-copy',
    })

    const result = await uploadBoardImages(
      makeImageBoard({
        hash: record.hash,
        cloudMediaExternalId: 'media-marketplace',
        cloudMediaOwnership: 'source',
      }),
      'user-1'
    )

    expect(result.mediaExternalIdByHash.get(record.hash)).toBe(
      'media-user-copy'
    )
    expect(result.mediaExternalIdByItemId.get('item-1')).toBe('media-user-copy')
    expect(finalizeUploadVariantsImperative).toHaveBeenCalledTimes(1)
  })

  it('uploads a fresh copy instead of reusing stale persisted cloud media refs', async () =>
  {
    const record = makeLocalBlobRecord('stale-cloud-hash')
    vi.mocked(getBlobsBatch).mockResolvedValue(new Map([[record.hash, record]]))
    vi.mocked(getReusableMediaExternalIdsImperative).mockResolvedValue([false])
    vi.mocked(generateUploadUrlsImperative).mockResolvedValue({
      envelopeUserId: 'server-user-1',
      urls: [
        { uploadUrl: 'https://uploads.example.test/tile', uploadToken: 'tile' },
        {
          uploadUrl: 'https://uploads.example.test/preview',
          uploadToken: 'preview',
        },
      ],
    })
    vi.mocked(uploadEnvelopedBlob).mockResolvedValue(
      'storage-1' as unknown as never
    )
    vi.mocked(finalizeUploadVariantsImperative).mockResolvedValue({
      externalId: 'media-fresh-copy',
    })

    const result = await uploadBoardImages(
      makeImageBoard({
        hash: record.hash,
        cloudMediaExternalId: 'media-stale',
      }),
      'user-1',
      { boardExternalId: 'board-1' }
    )

    expect(getReusableMediaExternalIdsImperative).toHaveBeenCalledWith({
      externalIds: ['media-stale'],
      boardExternalId: 'board-1',
    })
    expect(result.mediaExternalIdByHash.get(record.hash)).toBe(
      'media-fresh-copy'
    )
    expect(result.mediaExternalIdByItemId.get('item-1')).toBe(
      'media-fresh-copy'
    )
  })

  it('revalidates upload-index hits before skipping a media upload', async () =>
  {
    const record = makeLocalBlobRecord('upload-index-hash')
    vi.mocked(getUploadStatusBatch).mockResolvedValue(
      new Map([['media:upload-index-hash:upload-index-hash:', 'media-stale']])
    )
    vi.mocked(getReusableMediaExternalIdsImperative).mockResolvedValue([false])
    vi.mocked(getBlobsBatch).mockResolvedValue(new Map([[record.hash, record]]))
    vi.mocked(generateUploadUrlsImperative).mockResolvedValue({
      envelopeUserId: 'server-user-1',
      urls: [
        { uploadUrl: 'https://uploads.example.test/tile', uploadToken: 'tile' },
        {
          uploadUrl: 'https://uploads.example.test/preview',
          uploadToken: 'preview',
        },
      ],
    })
    vi.mocked(uploadEnvelopedBlob).mockResolvedValue(
      'storage-1' as unknown as never
    )
    vi.mocked(finalizeUploadVariantsImperative).mockResolvedValue({
      externalId: 'media-fresh',
    })

    const result = await uploadBoardImages(
      makeImageBoard({ hash: record.hash }),
      'user-1',
      { boardExternalId: 'board-1' }
    )

    expect(result.mediaExternalIdByHash.get(record.hash)).toBe('media-fresh')
    expect(markUploaded).toHaveBeenCalledWith(
      'user-1',
      'media:upload-index-hash:upload-index-hash:',
      'media-fresh'
    )
  })

  it('uploads blobs via the envelope helper using a single batched URL request', async () =>
  {
    const uploadToken = 'a'.repeat(64)
    const envelopeUserId = 'server-user-1'
    const record = makeLocalBlobRecord('hash-1')
    vi.mocked(getBlobsBatch).mockResolvedValue(new Map([[record.hash, record]]))
    vi.mocked(generateUploadUrlsImperative).mockResolvedValue({
      envelopeUserId,
      urls: [
        { uploadUrl: 'https://uploads.example.test/tile', uploadToken },
        { uploadUrl: 'https://uploads.example.test/preview', uploadToken },
      ],
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
    expect(generateUploadUrlsImperative).toHaveBeenCalledWith(2)
    expect(uploadEnvelopedBlob).toHaveBeenCalledWith({
      uploadUrl: 'https://uploads.example.test/tile',
      uploadToken,
      envelopeUserId,
      blob: expect.any(Blob),
    })
    expect(result.mediaExternalIdByHash.get(record.hash)).toBe('media-1')
    expect(markUploaded).toHaveBeenCalledWith(
      'local-user-1',
      'media:hash-1:hash-1:',
      'media-1'
    )
  })

  it('uploads preview, tile, & source refs under one media asset', async () =>
  {
    const previewToken = 'a'.repeat(64)
    const tileToken = 'b'.repeat(64)
    const editorToken = 'c'.repeat(64)
    const preview = makeLocalBlobRecord('preview-hash')
    const tile = makeLocalBlobRecord('tile-hash')
    const source = makeLocalBlobRecord('source-hash')
    vi.mocked(getBlobsBatch).mockResolvedValue(
      new Map([
        [preview.hash, preview],
        [tile.hash, tile],
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
          uploadUrl: 'https://uploads.example.test/preview',
          uploadToken: previewToken,
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
      makeImageBoard(
        { hash: preview.hash },
        { hash: tile.hash },
        { hash: source.hash }
      ),
      'user-1'
    )
    expect(generateUploadUrlsImperative).toHaveBeenCalledWith(3)
    expect(both.mediaExternalIdByHash.get(preview.hash)).toBe('media-1')
    expect(both.mediaExternalIdByHash.get(tile.hash)).toBe('media-1')
    expect(both.mediaExternalIdByHash.get(source.hash)).toBe('media-1')
    expect(both.mediaExternalIdByItemId.get('item-1')).toBe('media-1')
    expect(markUploaded).toHaveBeenCalledWith(
      'user-1',
      'media:preview-hash:tile-hash:source-hash',
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
          kind: 'preview',
          storageId: 'storage-1',
          uploadToken: previewToken,
        },
        {
          kind: 'editor',
          storageId: 'storage-1',
          uploadToken: editorToken,
        },
      ],
    })

    vi.clearAllMocks()
    vi.mocked(getBlobsBatch).mockResolvedValue(new Map())
    vi.mocked(generateUploadUrlsImperative).mockResolvedValue({
      envelopeUserId: 'server-user-1',
      urls: [],
    })
    vi.mocked(finalizeUploadVariantsImperative).mockResolvedValue({
      externalId: 'media-display',
    })

    const reusedSource = await uploadBoardImages(
      makeImageBoard(
        { hash: preview.hash, cloudMediaExternalId: 'media-display' },
        { hash: tile.hash, cloudMediaExternalId: 'media-display' },
        { hash: 'cloud-source', cloudMediaExternalId: 'media-display' }
      ),
      'user-1'
    )
    expect(reusedSource.mediaExternalIdByHash.get(preview.hash)).toBe(
      'media-display'
    )
    expect(reusedSource.mediaExternalIdByHash.get(tile.hash)).toBe(
      'media-display'
    )
    expect(reusedSource.mediaExternalIdByHash.get('cloud-source')).toBe(
      'media-display'
    )
    expect(getBlobsBatch).toHaveBeenCalledWith([])
  })

  it('keeps editor assets distinct when multiple items share a display hash', async () =>
  {
    const preview = makeLocalBlobRecord('preview-same')
    const tile = makeLocalBlobRecord('tile-same')
    const sourceA = makeLocalBlobRecord('source-a')
    const sourceB = makeLocalBlobRecord('source-b')
    vi.mocked(getBlobsBatch).mockResolvedValue(
      new Map([
        [preview.hash, preview],
        [tile.hash, tile],
        [sourceA.hash, sourceA],
        [sourceB.hash, sourceB],
      ])
    )
    vi.mocked(generateUploadUrlsImperative).mockResolvedValue({
      envelopeUserId: 'server-user-1',
      urls: [
        { uploadUrl: 'https://uploads.example.test/tile', uploadToken: 'tile' },
        {
          uploadUrl: 'https://uploads.example.test/preview',
          uploadToken: 'preview',
        },
        {
          uploadUrl: 'https://uploads.example.test/editor',
          uploadToken: 'editor',
        },
      ],
    })
    vi.mocked(uploadEnvelopedBlob)
      .mockResolvedValueOnce('storage-tile-a' as unknown as never)
      .mockResolvedValueOnce('storage-preview-a' as unknown as never)
      .mockResolvedValueOnce('storage-source-a' as unknown as never)
      .mockResolvedValueOnce('storage-tile-b' as unknown as never)
      .mockResolvedValueOnce('storage-preview-b' as unknown as never)
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
            imageRef: { hash: preview.hash },
            tileImageRef: { hash: tile.hash },
            sourceImageRef: { hash: sourceA.hash },
          }),
          [itemB]: makeItem({
            id: itemB,
            imageRef: { hash: preview.hash },
            tileImageRef: { hash: tile.hash },
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
      'media:preview-same:tile-same:source-a',
      'media-a'
    )
    expect(markUploaded).toHaveBeenCalledWith(
      'user-1',
      'media:preview-same:tile-same:source-b',
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
