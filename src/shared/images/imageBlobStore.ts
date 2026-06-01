// src/shared/images/imageBlobStore.ts
// content-addressed image blob bytes in IndexedDB

import { mapAsyncLimit } from '~/shared/lib/asyncMapLimit'
import { logger } from '~/shared/lib/logger'
import {
  BLOBS_STORE,
  IDB_READ_CONCURRENCY,
  imageStorageUnavailableError,
  memoryBlobs,
  openDatabaseSafe,
  pruneMemoryCaches,
  touchMemoryBlob,
  type BlobRecord,
  type ImageStoreReadOptions,
} from '~/shared/images/idb/idbDatabase'
import {
  abortTransactionOnSignal,
  awaitRequest,
  awaitTransaction,
  rethrowIfSignalAborted,
} from '~/shared/images/idb/idbHelpers'

export type { BlobRecord, ImageStoreReadOptions }

const fillMemoryFallback = (
  hashes: readonly string[],
  results: Map<string, BlobRecord | null>
): void =>
{
  for (const hash of hashes)
  {
    const record = memoryBlobs.get(hash) ?? null
    if (record) touchMemoryBlob(record)
    results.set(hash, record)
  }
}

// write a single blob record. throws when IDB is unavailable or the write
// fails so callers can avoid attaching refs to bytes that won't persist
export const putBlob = async (record: BlobRecord): Promise<void> =>
{
  touchMemoryBlob(record)
  pruneMemoryCaches(new Set([record.hash]))
  const db = await openDatabaseSafe()
  if (!db) throw imageStorageUnavailableError()

  const tx = db.transaction(BLOBS_STORE, 'readwrite')
  tx.objectStore(BLOBS_STORE).put(record)
  await awaitTransaction(tx)
}

// read a single blob record
export const getBlob = async (
  hash: string,
  options: ImageStoreReadOptions = {}
): Promise<BlobRecord | null> =>
{
  const { signal } = options
  signal?.throwIfAborted()
  const db = await openDatabaseSafe()
  signal?.throwIfAborted()
  if (!db)
  {
    const record = memoryBlobs.get(hash) ?? null
    if (record) touchMemoryBlob(record)
    return record
  }

  try
  {
    const tx = db.transaction(BLOBS_STORE, 'readonly')
    const cleanupAbort = abortTransactionOnSignal(tx, signal)
    try
    {
      const result = (await awaitRequest(
        tx.objectStore(BLOBS_STORE).get(hash)
      )) as BlobRecord | undefined
      await awaitTransaction(tx)
      signal?.throwIfAborted()
      const fallbackRecord = memoryBlobs.get(hash) ?? null
      if (!result && fallbackRecord) touchMemoryBlob(fallbackRecord)
      return result ?? fallbackRecord
    }
    finally
    {
      cleanupAbort()
    }
  }
  catch (error)
  {
    rethrowIfSignalAborted(signal, error)
    logger.warn('image', `IDB getBlob failed for ${hash}:`, error)
    const record = memoryBlobs.get(hash) ?? null
    if (record) touchMemoryBlob(record)
    return record
  }
}

// write many blob records in one transaction. throws when IDB is unavailable
// or the transaction fails so callers can avoid attaching refs to bytes that
// won't persist
export const putBlobs = async (
  records: readonly BlobRecord[]
): Promise<void> =>
{
  if (records.length === 0) return

  for (const record of records)
  {
    touchMemoryBlob(record)
  }
  pruneMemoryCaches(new Set(records.map((record) => record.hash)))

  const db = await openDatabaseSafe()
  if (!db) throw imageStorageUnavailableError()

  const tx = db.transaction(BLOBS_STORE, 'readwrite')
  const store = tx.objectStore(BLOBS_STORE)
  for (const record of records)
  {
    store.put(record)
  }
  await awaitTransaction(tx)
}

// read many blob records in one transaction, bounded so large board loads keep
// the IDB worker responsive
export const getBlobsBatch = async (
  hashes: readonly string[],
  options: ImageStoreReadOptions = {}
): Promise<Map<string, BlobRecord | null>> =>
{
  const { signal } = options
  signal?.throwIfAborted()
  const results = new Map<string, BlobRecord | null>()

  if (hashes.length === 0)
  {
    return results
  }

  const db = await openDatabaseSafe()
  signal?.throwIfAborted()
  if (!db)
  {
    fillMemoryFallback(hashes, results)
    return results
  }

  try
  {
    const tx = db.transaction(BLOBS_STORE, 'readonly')
    const store = tx.objectStore(BLOBS_STORE)
    const cleanupAbort = abortTransactionOnSignal(tx, signal)

    try
    {
      await mapAsyncLimit(hashes, IDB_READ_CONCURRENCY, async (hash) =>
      {
        signal?.throwIfAborted()
        const record = (await awaitRequest(store.get(hash))) as
          | BlobRecord
          | undefined
        signal?.throwIfAborted()
        const fallbackRecord = memoryBlobs.get(hash) ?? null
        if (!record && fallbackRecord) touchMemoryBlob(fallbackRecord)
        results.set(hash, record ?? fallbackRecord)
      })

      await awaitTransaction(tx)
      signal?.throwIfAborted()
      return results
    }
    finally
    {
      cleanupAbort()
    }
  }
  catch (error)
  {
    rethrowIfSignalAborted(signal, error)
    logger.warn(
      'image',
      `IDB getBlobsBatch failed for ${hashes.length} hash(es):`,
      error
    )
    fillMemoryFallback(hashes, results)
    return results
  }
}
