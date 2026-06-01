// src/shared/images/imageBlobGc.ts
// cross-store garbage collection for unreferenced local blobs

import { logger } from '~/shared/lib/logger'
import {
  BLOBS_STORE,
  BLOB_REFS_STORE,
  LOCAL_IMAGE_GC_GRACE_MS,
  UPLOAD_INDEX_BY_HASH,
  UPLOAD_INDEX_STORE,
  memoryBlobRefs,
  memoryBlobs,
  memoryUploadIndex,
  openDatabaseSafe,
  type BlobRecord,
  type BlobRefRecord,
} from '~/shared/images/idb/idbDatabase'
import {
  awaitIndexDeletes,
  awaitRequest,
  awaitTransaction,
} from '~/shared/images/idb/idbHelpers'

interface BlobGcRecord
{
  hash: string
  createdAt: number
}

export const resolveUnreferencedBlobHashes = (
  blobs: readonly BlobGcRecord[],
  referencedHashes: Iterable<string>,
  now = Date.now(),
  graceMs = LOCAL_IMAGE_GC_GRACE_MS
): string[] =>
{
  const referenced = new Set(referencedHashes)
  const cutoff = now - graceMs

  return blobs
    .filter((blob) => !referenced.has(blob.hash) && blob.createdAt <= cutoff)
    .map((blob) => blob.hash)
}

export const pruneUnreferencedBlobs = async (
  options: { graceMs?: number; now?: number } = {}
): Promise<{ deleted: number }> =>
{
  const memoryStaleHashes = resolveUnreferencedBlobHashes(
    [...memoryBlobs.values()].map((blob) => ({
      hash: blob.hash,
      createdAt: blob.createdAt,
    })),
    [...memoryBlobRefs.values()].map((ref) => ref.hash),
    options.now,
    options.graceMs
  )
  for (const hash of memoryStaleHashes)
  {
    memoryBlobs.delete(hash)
    for (const [key, record] of memoryUploadIndex)
    {
      if (record.hash === hash)
      {
        memoryUploadIndex.delete(key)
      }
    }
  }

  const db = await openDatabaseSafe()
  if (!db)
  {
    return { deleted: memoryStaleHashes.length }
  }

  try
  {
    const refsTx = db.transaction(BLOB_REFS_STORE, 'readonly')
    const refsDone = awaitTransaction(refsTx)
    const refs = (await awaitRequest(
      refsTx.objectStore(BLOB_REFS_STORE).getAll()
    )) as BlobRefRecord[]
    await refsDone

    const blobTx = db.transaction(BLOBS_STORE, 'readonly')
    const blobDone = awaitTransaction(blobTx)
    const blobs = (await awaitRequest(
      blobTx.objectStore(BLOBS_STORE).getAll()
    )) as BlobRecord[]
    await blobDone

    const staleHashes = resolveUnreferencedBlobHashes(
      blobs.map((blob) => ({ hash: blob.hash, createdAt: blob.createdAt })),
      refs.map((ref) => ref.hash),
      options.now,
      options.graceMs
    )

    if (staleHashes.length > 0)
    {
      const tx = db.transaction([BLOBS_STORE, UPLOAD_INDEX_STORE], 'readwrite')
      const done = awaitTransaction(tx)

      const blobsStore = tx.objectStore(BLOBS_STORE)
      const uploadIndexStore = tx.objectStore(UPLOAD_INDEX_STORE)
      const uploadIndexDeletes = staleHashes.map((hash) =>
        awaitIndexDeletes(uploadIndexStore, UPLOAD_INDEX_BY_HASH, hash)
      )
      for (const hash of staleHashes)
      {
        blobsStore.delete(hash)
      }

      await Promise.all(uploadIndexDeletes)
      await done
    }

    return { deleted: memoryStaleHashes.length + staleHashes.length }
  }
  catch (error)
  {
    logger.warn('image', 'IDB pruneUnreferencedBlobs failed:', error)
    return { deleted: memoryStaleHashes.length }
  }
}
