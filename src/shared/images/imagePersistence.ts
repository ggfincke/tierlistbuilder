// src/shared/images/imagePersistence.ts
// hash, persist, & optionally inline image bytes for local board items

import type { TierItemImageRef } from '@tierlistbuilder/contracts/workspace/board'
import {
  blobToDataUrl,
  dataUrlMimeType,
  dataUrlToBytes,
} from '~/shared/lib/binaryCodec'
import { sha256Hex, sha256HexFromBlob } from '~/shared/lib/sha256'
import { mapAsyncLimit } from '~/shared/lib/asyncMapLimit'
import { cacheFreshBlobs } from './imageBlobCache'
import { BLOB_PREPARE_CONCURRENCY } from './imageConcurrency'
import { probeImageStore, putBlobs, type BlobRecord } from './imageStore'
import { createBlobRecord } from './blobRecord'

// image value stored on a board item
export interface PersistedImageSource
{
  imageRef?: TierItemImageRef
  imageUrl?: string
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
  const blob = new Blob([bytes as BlobPart], { type: mimeType })

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

// persist one blob into IndexedDB or inline it when fallback is allowed
export const persistBlobSource = async (
  blob: Blob,
  options: {
    fallbackToDataUrl?: boolean
    warmCache?: boolean
  } = {}
): Promise<PersistedImageSource> =>
  (await persistBlobSources([blob], options))[0]!

// persist many blobs in one batch, falling back to inline data URLs if needed
export const persistBlobSources = async (
  blobs: readonly Blob[],
  options: {
    fallbackToDataUrl?: boolean
    warmCache?: boolean
  } = {}
): Promise<PersistedImageSource[]> =>
{
  const { fallbackToDataUrl = false, warmCache = true } = options
  const available = await probeImageStore()

  if (!available)
  {
    if (!fallbackToDataUrl)
    {
      throw new Error('Image storage is not available in this browser.')
    }

    return await mapAsyncLimit(
      blobs,
      BLOB_PREPARE_CONCURRENCY,
      async (blob) => ({
        imageUrl: await blobToDataUrl(blob),
      })
    )
  }

  const prepared = await mapAsyncLimit(
    blobs,
    BLOB_PREPARE_CONCURRENCY,
    prepareBlobRecord
  )

  try
  {
    await persistPreparedBlobRecords(prepared, warmCache)
    return prepared.map((entry) => ({
      imageRef: entry.imageRef,
    }))
  }
  catch
  {
    if (!fallbackToDataUrl)
    {
      throw new Error('Failed to store image bytes locally.')
    }

    return await mapAsyncLimit(
      blobs,
      BLOB_PREPARE_CONCURRENCY,
      async (blob) => ({
        imageUrl: await blobToDataUrl(blob),
      })
    )
  }
}
