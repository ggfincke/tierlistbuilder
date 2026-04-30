// tests/data/imageStore.test.ts
// persistent image-store GC planning

import { describe, expect, it } from 'vitest'
import {
  getBlobsBatch,
  getUploadStatusBatch,
  markUploaded,
  putBlobs,
  resolveUnreferencedBlobHashes,
} from '~/shared/images/imageStore'

describe('imageStore GC planning', () =>
{
  it('keeps referenced blobs and unreferenced blobs inside the grace window', () =>
  {
    const now = 10_000
    const graceMs = 1_000

    const stale = resolveUnreferencedBlobHashes(
      [
        { hash: 'referenced-old', createdAt: 1_000 },
        { hash: 'unreferenced-old', createdAt: 1_000 },
        { hash: 'unreferenced-new', createdAt: 9_500 },
      ],
      ['referenced-old'],
      now,
      graceMs
    )

    expect(stale).toEqual(['unreferenced-old'])
  })

  it('keeps imported blobs available in memory when IndexedDB is unavailable', async () =>
  {
    await putBlobs([
      {
        hash: 'memory-only',
        mimeType: 'image/png',
        byteSize: 4,
        createdAt: 1_000,
        bytes: new Blob(['data'], { type: 'image/png' }),
      },
    ])

    const blobs = await getBlobsBatch(['memory-only', 'missing'])

    expect(blobs.get('memory-only')?.mimeType).toBe('image/png')
    expect(blobs.get('missing')).toBeNull()
  })

  it('keeps upload status in memory when IndexedDB is unavailable', async () =>
  {
    await markUploaded('user-1', 'memory-upload', 'media-1')

    const statuses = await getUploadStatusBatch('user-1', [
      'memory-upload',
      'missing-upload',
    ])

    expect(statuses.get('memory-upload')).toBe('media-1')
    expect(statuses.get('missing-upload')).toBeNull()
  })
})
