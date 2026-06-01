// src/shared/images/imageBlobRefStore.ts
// board scope -> blob hash references for local image GC

import { logger } from '~/shared/lib/logger'
import {
  BLOB_REFS_BY_SCOPE,
  BLOB_REFS_STORE,
  memoryBlobRefs,
  openDatabaseSafe,
  pruneMemoryCaches,
  runBlobRefWrite,
  type BlobRefRecord,
} from '~/shared/images/idb/idbDatabase'
import {
  awaitIndexDeletes,
  awaitTransaction,
  replaceIndexRecords,
} from '~/shared/images/idb/idbHelpers'

const makeBlobRefId = (scope: string, hash: string): string =>
  `${scope}|${hash}`

const deleteMemoryBlobRefsForScope = (scope: string): void =>
{
  for (const [id, ref] of memoryBlobRefs)
  {
    if (ref.scope === scope)
    {
      memoryBlobRefs.delete(id)
    }
  }
}

const runBlobRefsTxForScope = async (
  write: (store: IDBObjectStore) => Promise<unknown>
): Promise<void> =>
{
  const db = await openDatabaseSafe()
  if (!db) return

  const tx = db.transaction(BLOB_REFS_STORE, 'readwrite')
  const done = awaitTransaction(tx)
  await write(tx.objectStore(BLOB_REFS_STORE))
  await done
}

export const replaceBlobRefs = async (
  scope: string,
  hashes: readonly string[]
): Promise<void> =>
  runBlobRefWrite(scope, async () =>
  {
    deleteMemoryBlobRefsForScope(scope)
    const uniqueHashes = [...new Set(hashes)]
    const now = Date.now()
    const nextRefs = uniqueHashes.map(
      (hash) =>
        ({
          id: makeBlobRefId(scope, hash),
          scope,
          hash,
          updatedAt: now,
        }) satisfies BlobRefRecord
    )

    for (const ref of nextRefs)
    {
      memoryBlobRefs.delete(ref.id)
      memoryBlobRefs.set(ref.id, ref)
    }
    pruneMemoryCaches(new Set(uniqueHashes))

    try
    {
      await runBlobRefsTxForScope((store) =>
        replaceIndexRecords(store, BLOB_REFS_BY_SCOPE, scope, nextRefs)
      )
    }
    catch (error)
    {
      logger.warn(
        'image',
        `IDB replaceBlobRefs failed for scope ${scope}:`,
        error
      )
    }
  })

export const clearBlobRefs = async (scope: string): Promise<void> =>
  runBlobRefWrite(scope, async () =>
  {
    deleteMemoryBlobRefsForScope(scope)

    try
    {
      await runBlobRefsTxForScope((store) =>
        awaitIndexDeletes(store, BLOB_REFS_BY_SCOPE, scope)
      )
    }
    catch (error)
    {
      logger.warn(
        'image',
        `IDB clearBlobRefs failed for scope ${scope}:`,
        error
      )
    }
  })
