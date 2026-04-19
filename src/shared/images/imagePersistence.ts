// src/shared/images/imagePersistence.ts
// hash, persist, & optionally inline image bytes for local board items

import type { TierItemImageRef } from '@tierlistbuilder/contracts/workspace/board'
import { dataUrlMimeType, dataUrlToBytes } from '~/shared/lib/binaryCodec'
import { sha256Hex, sha256HexFromBlob } from '~/shared/lib/sha256'
import { mapAsyncLimit } from '~/shared/lib/asyncMapLimit'
import { cacheFreshBlobs } from './imageBlobCache'
import { probeImageStore, putBlobs, type BlobRecord } from './imageStore'

// bound parallel blob prepare work (hash + record build). limit is low because
// hashing is CPU-heavy & we don't want to starve the main thread
export const BLOB_PREPARE_CONCURRENCY = 3

// build a normalized IndexedDB blob record — exported for the cloud image
// fetcher which constructs records from download responses
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

// image value stored on a board item
export interface PersistedImageSource
{
  imageRef?: TierItemImageRef
}

// prepared blob record ready for a single batch store write
export interface PreparedBlobRecord
{
  imageRef: TierItemImageRef
  record: BlobRecord
  blob: Blob
}

// prepare a batch-ready blob record from raw blob bytes
export const prepareBlobRecord = async (
  blob: Blob
): Promise<PreparedBlobRecord> =>
{
  const hash = await sha256HexFromBlob(blob)

  return {
    imageRef: { hash },
    blob,
    record: createBlobRecord(hash, blob),
  }
}

// prepare a batch-ready blob record from a data URL
export const prepareDataUrlRecord = async (
  dataUrl: string
): Promise<PreparedBlobRecord> =>
{
  const bytes = dataUrlToBytes(dataUrl)
  const hash = await sha256Hex(bytes as unknown as BufferSource)
  const mimeType = dataUrlMimeType(dataUrl)
  const blob = new Blob([bytes as unknown as BlobPart], { type: mimeType })

  return {
    imageRef: { hash },
    blob,
    record: createBlobRecord(hash, blob, mimeType),
  }
}

// commit prepared records in one store transaction & warm the cache once
export const persistPreparedBlobRecords = async (
  prepared: readonly PreparedBlobRecord[],
  warmCache = true
): Promise<void> =>
{
  if (prepared.length === 0)
  {
    return
  }

  await putBlobs(prepared.map((entry) => entry.record))

  if (warmCache)
  {
    cacheFreshBlobs(
      prepared.map((entry) => [entry.imageRef.hash, entry.blob] as const)
    )
  }
}

// persist one blob into IndexedDB
export const persistBlobSource = async (
  blob: Blob,
  options: { warmCache?: boolean } = {}
): Promise<PersistedImageSource> =>
  (await persistBlobSources([blob], options))[0]!

// persist many blobs in one batch. throws if IDB is unavailable or the
// transaction fails — callers previously had an opt-in data-URL fallback but
// that path is gone: TierItem no longer carries inline imageUrl in memory
export const persistBlobSources = async (
  blobs: readonly Blob[],
  options: { warmCache?: boolean } = {}
): Promise<PersistedImageSource[]> =>
{
  const { warmCache = true } = options
  const available = await probeImageStore()

  if (!available)
  {
    throw new Error('Image storage is not available in this browser.')
  }

  const prepared = await mapAsyncLimit(
    blobs,
    BLOB_PREPARE_CONCURRENCY,
    prepareBlobRecord
  )

  await persistPreparedBlobRecords(prepared, warmCache)
  return prepared.map((entry) => ({
    imageRef: entry.imageRef,
  }))
}
