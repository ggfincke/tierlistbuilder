// src/shared/images/imageStore.ts
// IndexedDB-backed image blob store keyed by content hash

import { mapAsyncLimit } from '~/shared/lib/asyncMapLimit'

const DB_NAME = 'tierlistbuilder-images'
const DB_VERSION = 2
const BLOBS_STORE = 'blobs'
const UPLOAD_INDEX_STORE = 'uploadIndex'

// cap on parallel IDB reads during getBlobsBatch — an unbounded Promise.all
// over a single transaction could saturate the single-threaded IDB worker
// on a large board load & stall the main thread
const IDB_READ_CONCURRENCY = 8

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
export interface UploadIndexRecord
{
  userId: string
  hash: string
  cloudMediaExternalId: string
}

let dbPromise: Promise<IDBDatabase> | null = null
let indexedDbUnavailable = false

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

    request.onupgradeneeded = (event) =>
    {
      const db = request.result
      const oldVersion = event.oldVersion

      if (oldVersion < 1)
      {
        db.createObjectStore(BLOBS_STORE, { keyPath: 'hash' })
      }

      if (oldVersion < 2)
      {
        db.createObjectStore(UPLOAD_INDEX_STORE, {
          keyPath: ['userId', 'hash'],
        })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to open IndexedDB.'))
    request.onblocked = () =>
      reject(new Error('IndexedDB upgrade blocked by another tab.'))
  })

  pending.catch(() =>
  {
    dbPromise = null
    indexedDbUnavailable = true
  })

  dbPromise = pending
  return pending
}

const openDatabaseSafe = async (): Promise<IDBDatabase | null> =>
{
  if (indexedDbUnavailable)
  {
    return null
  }

  try
  {
    return await openDatabase()
  }
  catch
  {
    return null
  }
}

const awaitRequest = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) =>
  {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB request failed.'))
  })

const awaitTransaction = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) =>
  {
    tx.oncomplete = () => resolve()
    tx.onerror = () =>
      reject(tx.error ?? new Error('IndexedDB transaction failed.'))
    tx.onabort = () =>
      reject(tx.error ?? new Error('IndexedDB transaction aborted.'))
  })

export const isImageStoreAvailable = (): boolean => !indexedDbUnavailable

export const probeImageStore = async (): Promise<boolean> =>
{
  const db = await openDatabaseSafe()
  return db !== null
}

// write a single blob record
export const putBlob = async (record: BlobRecord): Promise<void> =>
{
  const db = await openDatabaseSafe()
  if (!db)
  {
    throw new Error('Image store is not available.')
  }

  const tx = db.transaction(BLOBS_STORE, 'readwrite')
  tx.objectStore(BLOBS_STORE).put(record)
  await awaitTransaction(tx)
}

// read a single blob record
export const getBlob = async (hash: string): Promise<BlobRecord | null> =>
{
  const db = await openDatabaseSafe()
  if (!db)
  {
    return null
  }

  const tx = db.transaction(BLOBS_STORE, 'readonly')
  const result = (await awaitRequest(tx.objectStore(BLOBS_STORE).get(hash))) as
    | BlobRecord
    | undefined

  return result ?? null
}

// write many blob records in one transaction
export const putBlobs = async (
  records: readonly BlobRecord[]
): Promise<void> =>
{
  if (records.length === 0)
  {
    return
  }

  const db = await openDatabaseSafe()
  if (!db)
  {
    throw new Error('Image store is not available.')
  }

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
  hashes: readonly string[]
): Promise<Map<string, BlobRecord | null>> =>
{
  const results = new Map<string, BlobRecord | null>()

  if (hashes.length === 0)
  {
    return results
  }

  const db = await openDatabaseSafe()
  if (!db)
  {
    for (const hash of hashes)
    {
      results.set(hash, null)
    }
    return results
  }

  const tx = db.transaction(BLOBS_STORE, 'readonly')
  const store = tx.objectStore(BLOBS_STORE)

  await mapAsyncLimit(hashes, IDB_READ_CONCURRENCY, async (hash) =>
  {
    const record = (await awaitRequest(store.get(hash))) as
      | BlobRecord
      | undefined
    results.set(hash, record ?? null)
  })

  await awaitTransaction(tx)
  return results
}

// record that a hash has been uploaded to a cloud account
export const markUploaded = async (
  userId: string,
  hash: string,
  cloudMediaExternalId: string
): Promise<void> =>
{
  const db = await openDatabaseSafe()
  if (!db)
  {
    return
  }

  const tx = db.transaction(UPLOAD_INDEX_STORE, 'readwrite')
  tx.objectStore(UPLOAD_INDEX_STORE).put({
    userId,
    hash,
    cloudMediaExternalId,
  } satisfies UploadIndexRecord)

  await awaitTransaction(tx)
}

// check if a hash has been uploaded for a given user
export const getUploadStatus = async (
  userId: string,
  hash: string
): Promise<string | null> =>
{
  const db = await openDatabaseSafe()
  if (!db)
  {
    return null
  }

  const tx = db.transaction(UPLOAD_INDEX_STORE, 'readonly')
  const result = (await awaitRequest(
    tx.objectStore(UPLOAD_INDEX_STORE).get([userId, hash])
  )) as UploadIndexRecord | undefined

  return result?.cloudMediaExternalId ?? null
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

  const db = await openDatabaseSafe()
  if (!db)
  {
    for (const hash of hashes)
    {
      results.set(hash, null)
    }
    return results
  }

  const tx = db.transaction(UPLOAD_INDEX_STORE, 'readonly')
  const store = tx.objectStore(UPLOAD_INDEX_STORE)

  await mapAsyncLimit(hashes, IDB_READ_CONCURRENCY, async (hash) =>
  {
    const record = (await awaitRequest(store.get([userId, hash]))) as
      | UploadIndexRecord
      | undefined
    results.set(hash, record?.cloudMediaExternalId ?? null)
  })

  await awaitTransaction(tx)
  return results
}

// count all blob records — used as a rough orphan-growth metric until the
// full refcount/GC pass lands. todo: once blobRefs store ships this should
// also return refCount totals & stale-entry counts for observability
export const countStoredBlobs = async (): Promise<number> =>
{
  const db = await openDatabaseSafe()
  if (!db)
  {
    return 0
  }

  const tx = db.transaction(BLOBS_STORE, 'readonly')
  const result = (await awaitRequest(tx.objectStore(BLOBS_STORE).count())) as
    | number
    | undefined
  return result ?? 0
}

// todo: GC — add blobRefs store (bump DB_VERSION), wire refcount into board
// mutations, & run a startup reconciliation pass over all snapshots to fix drift

// clear all upload index entries for a user
export const clearUploadIndex = async (userId: string): Promise<void> =>
{
  const db = await openDatabaseSafe()
  if (!db)
  {
    return
  }

  const tx = db.transaction(UPLOAD_INDEX_STORE, 'readwrite')
  const store = tx.objectStore(UPLOAD_INDEX_STORE)
  const range = IDBKeyRange.bound([userId], [userId, '\uffff'])
  const cursorReq = store.openCursor(range)

  await new Promise<void>((resolve, reject) =>
  {
    tx.oncomplete = () => resolve()
    tx.onerror = () =>
      reject(tx.error ?? new Error('IndexedDB transaction failed.'))
    tx.onabort = () =>
      reject(tx.error ?? new Error('IndexedDB transaction aborted.'))

    cursorReq.onsuccess = () =>
    {
      const cursor = cursorReq.result
      if (!cursor)
      {
        return
      }

      cursor.delete()
      cursor.continue()
    }
    cursorReq.onerror = () =>
      reject(cursorReq.error ?? new Error('Failed to iterate upload index.'))
  })
}
