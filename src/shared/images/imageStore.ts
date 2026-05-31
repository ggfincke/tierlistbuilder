// src/shared/images/imageStore.ts
// IndexedDB-backed image blob store keyed by content hash

import { logger } from '~/shared/lib/logger'
import { mapAsyncLimit } from '~/shared/lib/asyncMapLimit'
import {
  pruneOldestMapEntries,
  setMapEntryLru,
  touchMapEntry,
} from '~/shared/lib/lru'

const DB_NAME = 'tierlistbuilder-images'
// bumped past 5 because main shipped a v5 schema (blobs+blobRefs only); this
// branch still needs uploadIndex, so v6 forces a clean upgrade w/ all 3 stores
const DB_VERSION = 6
const BLOBS_STORE = 'blobs'
const UPLOAD_INDEX_STORE = 'uploadIndex'
const BLOB_REFS_STORE = 'blobRefs'
const BLOB_REFS_BY_SCOPE = 'byScope'
const UPLOAD_INDEX_BY_HASH = 'byHash'

// cap on parallel IDB reads during getBlobsBatch — an unbounded Promise.all
// over a single transaction could saturate the single-threaded IDB worker
// on a large board load & stall the main thread
const IDB_READ_CONCURRENCY = 8
const LOCAL_IMAGE_GC_GRACE_MS = 7 * 24 * 60 * 60 * 1000
const MAX_MEMORY_BLOBS = 512
const MAX_MEMORY_UPLOAD_INDEX = 2_048
const MAX_MEMORY_BLOB_REFS = 4_096

// persisted blob metadata & bytes
export interface BlobRecord
{
  hash: string
  mimeType: string
  byteSize: number
  createdAt: number
  bytes: Blob
}

// upload tracking record — maps [userId, hash] to a cloud media externalId
interface UploadIndexRecord
{
  userId: string
  hash: string
  cloudMediaExternalId: string
}

interface BlobRefRecord
{
  id: string
  scope: string
  hash: string
  updatedAt: number
}

let dbPromise: Promise<IDBDatabase> | null = null
const blobRefWriteQueues = new Map<string, Promise<void>>()
const memoryBlobs = new Map<string, BlobRecord>()
const memoryUploadIndex = new Map<string, UploadIndexRecord>()
const memoryBlobRefs = new Map<string, BlobRefRecord>()

interface ImageStoreReadOptions
{
  signal?: AbortSignal
}

const uploadIndexKey = (userId: string, hash: string): string =>
  `${userId}|${hash}`

const touchMemoryBlob = (record: BlobRecord): void =>
{
  memoryBlobs.set(record.hash, record)
  touchMapEntry(memoryBlobs, record.hash)
}

const touchMemoryUploadIndex = (record: UploadIndexRecord): void =>
{
  setMapEntryLru(
    memoryUploadIndex,
    uploadIndexKey(record.userId, record.hash),
    record,
    MAX_MEMORY_UPLOAD_INDEX
  )
}

const pruneMemoryCaches = (
  protectedBlobHashes: ReadonlySet<string> = new Set()
): void =>
{
  // hot import paths (prepareItemRenditions ships 3 putBlobs per item) call
  // this on every blob write; short-circuit when nothing is over its cap so
  // the referencedBlobHashes walk over up-to-4096 refs doesn't run for nothing
  if (
    memoryUploadIndex.size <= MAX_MEMORY_UPLOAD_INDEX &&
    memoryBlobRefs.size <= MAX_MEMORY_BLOB_REFS &&
    memoryBlobs.size <= MAX_MEMORY_BLOBS
  )
  {
    return
  }

  pruneOldestMapEntries(memoryUploadIndex, MAX_MEMORY_UPLOAD_INDEX)
  pruneOldestMapEntries(memoryBlobRefs, MAX_MEMORY_BLOB_REFS)

  const referencedBlobHashes = new Set(protectedBlobHashes)
  for (const ref of memoryBlobRefs.values())
  {
    referencedBlobHashes.add(ref.hash)
  }

  pruneOldestMapEntries(memoryBlobs, MAX_MEMORY_BLOBS, (hash) =>
    referencedBlobHashes.has(hash)
  )
}

const openDatabase = (): Promise<IDBDatabase> =>
{
  if (dbPromise)
  {
    return dbPromise
  }

  const pending = new Promise<IDBDatabase>((resolve, reject) =>
  {
    if (typeof indexedDB === 'undefined')
    {
      reject(new Error('IndexedDB is not available in this browser.'))
      return
    }

    let request: IDBOpenDBRequest

    try
    {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    }
    catch (error)
    {
      reject(error instanceof Error ? error : new Error(String(error)))
      return
    }

    request.onupgradeneeded = () =>
    {
      const db = request.result

      for (const storeName of Array.from(db.objectStoreNames))
      {
        db.deleteObjectStore(storeName)
      }

      db.createObjectStore(BLOBS_STORE, { keyPath: 'hash' })
      const uploadIndex = db.createObjectStore(UPLOAD_INDEX_STORE, {
        keyPath: ['userId', 'hash'],
      })
      uploadIndex.createIndex(UPLOAD_INDEX_BY_HASH, 'hash', {
        unique: false,
      })
      const refsStore = db.createObjectStore(BLOB_REFS_STORE, {
        keyPath: 'id',
      })
      refsStore.createIndex(BLOB_REFS_BY_SCOPE, 'scope', { unique: false })
    }

    request.onsuccess = () =>
    {
      request.result.onversionchange = () =>
      {
        request.result.close()
        dbPromise = null
      }
      resolve(request.result)
    }
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to open IndexedDB.'))
    request.onblocked = () =>
      reject(new Error('IndexedDB upgrade blocked by another tab.'))
  })

  pending.catch(() =>
  {
    dbPromise = null
  })

  dbPromise = pending
  return pending
}

const disposeImageStore = (): void =>
{
  const pending = dbPromise
  dbPromise = null
  blobRefWriteQueues.clear()
  memoryBlobs.clear()
  memoryUploadIndex.clear()
  memoryBlobRefs.clear()
  if (pending)
  {
    void pending.then((db) => db.close()).catch(() => undefined)
  }
}

import.meta.hot?.dispose(disposeImageStore)

const openDatabaseSafe = async (): Promise<IDBDatabase | null> =>
{
  try
  {
    return await openDatabase()
  }
  catch (error)
  {
    logger.warn('image', `Failed to open ${DB_NAME} v${DB_VERSION}:`, error)
    return null
  }
}

const imageStoreUnavailableError = (): Error =>
  new Error('IndexedDB image storage is unavailable.')

const awaitRequest = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) =>
  {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB request failed.'))
  })

const makeAbortError = (): DOMException =>
  new DOMException('IndexedDB transaction aborted.', 'AbortError')

const awaitTransaction = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) =>
  {
    tx.oncomplete = () => resolve()
    tx.onerror = () =>
      reject(tx.error ?? new Error('IndexedDB transaction failed.'))
    tx.onabort = () => reject(tx.error ?? makeAbortError())
  })

const abortTransactionOnSignal = (
  tx: IDBTransaction,
  signal: AbortSignal | undefined
): (() => void) =>
{
  if (!signal) return () => undefined

  const handleAbort = (): void =>
  {
    try
    {
      tx.abort()
    }
    catch
    {
      // Transaction may already have completed by the time an abort event lands.
    }
  }

  if (signal.aborted)
  {
    handleAbort()
    return () => undefined
  }

  signal.addEventListener('abort', handleAbort, { once: true })
  return () => signal.removeEventListener('abort', handleAbort)
}

const rethrowIfSignalAborted = (
  signal: AbortSignal | undefined,
  fallback: unknown
): void =>
{
  if (!signal?.aborted) return
  throw signal.reason ?? fallback
}

const awaitIndexDeletes = (
  store: IDBObjectStore,
  indexName: string,
  query: IDBValidKey | IDBKeyRange
): Promise<void> =>
  new Promise((resolve, reject) =>
  {
    const request = store.index(indexName).openCursor(query)
    request.onsuccess = () =>
    {
      const cursor = request.result
      if (!cursor)
      {
        resolve()
        return
      }

      cursor.delete()
      cursor.continue()
    }
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB cursor failed.'))
  })

const replaceIndexRecords = (
  store: IDBObjectStore,
  indexName: string,
  query: IDBValidKey | IDBKeyRange,
  records: readonly unknown[]
): Promise<void> =>
  new Promise((resolve, reject) =>
  {
    const request = store.index(indexName).openCursor(query)
    request.onsuccess = () =>
    {
      const cursor = request.result
      if (cursor)
      {
        cursor.delete()
        cursor.continue()
        return
      }

      for (const record of records)
      {
        store.put(record)
      }
      resolve()
    }
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB cursor failed.'))
  })

const makeBlobRefId = (scope: string, hash: string): string =>
  `${scope}|${hash}`

const runBlobRefWrite = (
  scope: string,
  write: () => Promise<void>
): Promise<void> =>
{
  const previous = blobRefWriteQueues.get(scope) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(write)
  blobRefWriteQueues.set(scope, next)

  return next.finally(() =>
  {
    if (blobRefWriteQueues.get(scope) === next)
    {
      blobRefWriteQueues.delete(scope)
    }
  })
}

// returns true when IDB opened successfully, false when unavailable. callers
// that need a hard fail (eg JSON import) gate on this so an upload that can't
// persist surfaces immediately instead of silently living in memory only
export const probeImageStore = async (): Promise<boolean> =>
{
  return (await openDatabaseSafe()) !== null
}

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
  if (!db) throw imageStoreUnavailableError()

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
  if (!db) throw imageStoreUnavailableError()

  const tx = db.transaction(BLOBS_STORE, 'readwrite')
  const store = tx.objectStore(BLOBS_STORE)
  for (const record of records)
  {
    store.put(record)
  }
  await awaitTransaction(tx)
}

// read many blob records in one transaction, bounded concurrency to keep
// the IDB worker responsive on large board loads
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
