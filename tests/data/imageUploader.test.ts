// tests/data/imageUploader.test.ts
// cloud media upload planning

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConvexError } from 'convex/values'
import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { getUploadEnvelopeHeader } from '@tierlistbuilder/contracts/platform/uploadEnvelope'
import { uploadBoardImages } from '~/features/platform/media/imageUploader'
import {
  getBlobsBatch,
  getUploadStatusBatch,
  markUploaded,
} from '~/shared/images/imageStore'
import {
  finalizeUploadImperative,
  generateUploadUrlImperative,
} from '~/features/workspace/boards/data/cloud/boardRepository'
import { PermanentSyncError } from '~/features/platform/sync/lib/errors'
import { makeBoardSnapshot, makeItem } from '../fixtures'

vi.mock('~/features/workspace/boards/data/cloud/boardRepository', () => ({
  generateUploadUrlImperative: vi.fn(),
  finalizeUploadImperative: vi.fn(),
}))

vi.mock('~/shared/images/imageStore', () => ({
  getBlobsBatch: vi.fn(),
  getUploadStatusBatch: vi.fn(),
  markUploaded: vi.fn(),
}))

const makeImageBoard = (
  imageRef: NonNullable<BoardSnapshot['items'][string]['imageRef']>
): BoardSnapshot =>
{
  const itemId = asItemId('item-1')
  return makeBoardSnapshot({
    items: {
      [itemId]: makeItem({
        id: itemId,
        imageRef,
      }),
    },
  })
}

const makeSourceImageBoard = (
  imageRef: NonNullable<BoardSnapshot['items'][string]['imageRef']>,
  sourceImageRef: NonNullable<BoardSnapshot['items'][string]['sourceImageRef']>
): BoardSnapshot =>
{
  const itemId = asItemId('item-1')
  return makeBoardSnapshot({
    items: {
      [itemId]: makeItem({
        id: itemId,
        imageRef,
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
  })

  it('reuses cloud media ids when the local blob is absent', async () =>
  {
    const result = await uploadBoardImages(
      makeImageBoard({
        hash: 'hash-from-cloud',
        cloudMediaExternalId: 'media-existing',
      }),
      'user-1'
    )

    expect(result.mediaExternalIdByHash.get('hash-from-cloud')).toBe(
      'media-existing'
    )
  })

  it('throws for a local-only image when the blob is absent', async () =>
  {
    await expect(
      uploadBoardImages(makeImageBoard({ hash: 'local-only-hash' }), 'user-1')
    ).rejects.toBeInstanceOf(PermanentSyncError)
  })

  it('uses the server envelope user id while indexing uploads locally', async () =>
  {
    const uploadToken = 'a'.repeat(64)
    const localUserId = 'local-user-1'
    const envelopeUserId = 'server-user-1'
    const record = makeLocalBlobRecord('hash-1')
    vi.mocked(getBlobsBatch).mockResolvedValue(new Map([[record.hash, record]]))
    vi.mocked(generateUploadUrlImperative).mockResolvedValue({
      uploadUrl: 'https://uploads.example.test',
      uploadToken,
      envelopeUserId,
    })
    vi.mocked(finalizeUploadImperative).mockResolvedValue({
      externalId: 'media-1',
    })

    const fetchMock = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
      {
        const body = init?.body
        expect(body).toBeInstanceOf(Blob)
        const bytes = new Uint8Array(await (body as Blob).arrayBuffer())
        const header = getUploadEnvelopeHeader(
          'media',
          envelopeUserId,
          uploadToken
        )

        expect(bytes.slice(0, header.length)).toEqual(header)
        return new Response(JSON.stringify({ storageId: 'storage-1' }), {
          status: 200,
        })
      }
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await uploadBoardImages(
      makeImageBoard({ hash: record.hash }),
      localUserId
    )

    expect(result.mediaExternalIdByHash.get(record.hash)).toBe('media-1')
    expect(markUploaded).toHaveBeenCalledWith(
      localUserId,
      record.hash,
      'media-1'
    )
  })

  it('uploads source image refs as separate media assets', async () =>
  {
    const uploadToken = 'b'.repeat(64)
    const display = makeLocalBlobRecord('display-hash')
    const source = makeLocalBlobRecord('source-hash')
    vi.mocked(getBlobsBatch).mockResolvedValue(
      new Map([
        [display.hash, display],
        [source.hash, source],
      ])
    )
    vi.mocked(generateUploadUrlImperative).mockResolvedValue({
      uploadUrl: 'https://uploads.example.test',
      uploadToken,
      envelopeUserId: 'server-user-1',
    })
    vi.mocked(finalizeUploadImperative)
      .mockResolvedValueOnce({ externalId: 'media-display' })
      .mockResolvedValueOnce({ externalId: 'media-source' })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ storageId: 'storage-1' }), {
            status: 200,
          })
      )
    )

    const result = await uploadBoardImages(
      makeSourceImageBoard({ hash: display.hash }, { hash: source.hash }),
      'user-1'
    )

    expect(getBlobsBatch).toHaveBeenCalledWith(
      expect.arrayContaining([display.hash, source.hash])
    )
    expect(result.mediaExternalIdByHash.get(display.hash)).toBe('media-display')
    expect(result.mediaExternalIdByHash.get(source.hash)).toBe('media-source')
  })

  it('reuses cloud source refs even when the display ref needs upload', async () =>
  {
    const uploadToken = 'c'.repeat(64)
    const display = makeLocalBlobRecord('display-hash')
    vi.mocked(getBlobsBatch).mockResolvedValue(
      new Map([[display.hash, display]])
    )
    vi.mocked(generateUploadUrlImperative).mockResolvedValue({
      uploadUrl: 'https://uploads.example.test',
      uploadToken,
      envelopeUserId: 'server-user-1',
    })
    vi.mocked(finalizeUploadImperative).mockResolvedValue({
      externalId: 'media-display',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ storageId: 'storage-1' }), {
            status: 200,
          })
      )
    )

    const result = await uploadBoardImages(
      makeSourceImageBoard(
        { hash: display.hash },
        {
          hash: 'source-hash',
          cloudMediaExternalId: 'media-source-existing',
        }
      ),
      'user-1'
    )

    expect(getBlobsBatch).toHaveBeenCalledWith([display.hash])
    expect(result.mediaExternalIdByHash.get(display.hash)).toBe('media-display')
    expect(result.mediaExternalIdByHash.get('source-hash')).toBe(
      'media-source-existing'
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
    vi.mocked(generateUploadUrlImperative).mockRejectedValue(rateLimited)

    await expect(
      uploadBoardImages(makeImageBoard({ hash: record.hash }), 'user-1')
    ).rejects.toBe(rateLimited)

    expect(generateUploadUrlImperative).toHaveBeenCalledTimes(1)
    expect(finalizeUploadImperative).not.toHaveBeenCalled()
  })
})
