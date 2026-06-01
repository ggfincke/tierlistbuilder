// src/shared/images/imageUploadIndex.ts
// cloud upload index for locally stored image hashes

import { mapAsyncLimit } from '~/shared/lib/asyncMapLimit'
import { logger } from '~/shared/lib/logger'
import {
  IDB_READ_CONCURRENCY,
  UPLOAD_INDEX_STORE,
  memoryUploadIndex,
  openDatabaseSafe,
  pruneMemoryCaches,
  touchMemoryUploadIndex,
  uploadIndexKey,
  type UploadIndexRecord,
} from '~/shared/images/idb/idbDatabase'
import { awaitRequest, awaitTransaction } from '~/shared/images/idb/idbHelpers'

// record that a hash has been uploaded to a cloud account
export const markUploaded = async (
  userId: string,
  hash: string,
  cloudMediaExternalId: string
): Promise<void> =>
{
  const record = {
    userId,
    hash,
    cloudMediaExternalId,
  } satisfies UploadIndexRecord
  touchMemoryUploadIndex(record)
  pruneMemoryCaches()

  const db = await openDatabaseSafe()
  if (!db)
  {
    return
  }

  try
  {
    const tx = db.transaction(UPLOAD_INDEX_STORE, 'readwrite')
    tx.objectStore(UPLOAD_INDEX_STORE).put(record)
    await awaitTransaction(tx)
  }
  catch (error)
  {
    logger.warn('image', `IDB markUploaded failed for hash ${hash}:`, error)
  }
}

// check upload status for many hashes in one transaction
export const getUploadStatusBatch = async (
  userId: string,
  hashes: readonly string[]
): Promise<Map<string, string | null>> =>
{
  const results = new Map<string, string | null>()

  if (hashes.length === 0)
  {
    return results
  }

  const fillFromMemory = (): void =>
  {
    for (const hash of hashes)
    {
      const record = memoryUploadIndex.get(uploadIndexKey(userId, hash))
      if (record) touchMemoryUploadIndex(record)
      results.set(hash, record?.cloudMediaExternalId ?? null)
    }
  }

  const db = await openDatabaseSafe()
  if (!db)
  {
    fillFromMemory()
    return results
  }

  try
  {
    const tx = db.transaction(UPLOAD_INDEX_STORE, 'readonly')
    const store = tx.objectStore(UPLOAD_INDEX_STORE)

    await mapAsyncLimit(hashes, IDB_READ_CONCURRENCY, async (hash) =>
    {
      const record = (await awaitRequest(store.get([userId, hash]))) as
        | UploadIndexRecord
        | undefined
      const fallbackRecord = memoryUploadIndex.get(uploadIndexKey(userId, hash))
      if (!record && fallbackRecord) touchMemoryUploadIndex(fallbackRecord)
      results.set(
        hash,
        record?.cloudMediaExternalId ??
          fallbackRecord?.cloudMediaExternalId ??
          null
      )
    })

    await awaitTransaction(tx)
    return results
  }
  catch (error)
  {
    logger.warn(
      'image',
      `IDB getUploadStatusBatch failed for ${hashes.length} hash(es):`,
      error
    )
    fillFromMemory()
    return results
  }
}
