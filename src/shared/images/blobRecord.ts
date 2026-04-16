// src/shared/images/blobRecord.ts
// build normalized IndexedDB blob records from known bytes & hashes

import type { BlobRecord } from './imageStore'

export const createBlobRecord = (
  hash: string,
  blob: Blob,
  mimeType = blob.type || 'image/png'
): BlobRecord => ({
  hash,
  mimeType,
  byteSize: blob.size,
  createdAt: Date.now(),
  bytes: blob,
})
