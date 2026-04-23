// tests/data/imageUploader.test.ts
// cloud media upload planning

import { describe, expect, it, vi } from 'vitest'
import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'
import { uploadBoardImages } from '~/features/platform/media/imageUploader'
import { makeBoardSnapshot, makeItem } from '../fixtures'

vi.mock('~/features/workspace/boards/data/cloud/boardRepository', () => ({
  generateUploadUrlImperative: vi.fn(),
  finalizeUploadImperative: vi.fn(),
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

describe('uploadBoardImages', () =>
{
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
    ).rejects.toThrow('missing local blobs')
  })
})
