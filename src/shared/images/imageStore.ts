// src/shared/images/imageStore.ts
// IndexedDB-backed image blob store keyed by content hash

// image database name
const DB_NAME = 'tierlistbuilder-images'

// schema version for the image database
const DB_VERSION = 1

// blob object store name
const BLOBS_STORE = 'blobs'

// persisted blob metadata & bytes
export interface BlobRecord
{
  hash: string
  mimeType: string
  byteSize: number
  createdAt: number
  bytes: Blob
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

    request.onupgradeneeded = () =>
    {
      const db = request.result
      if (!db.objectStoreNames.contains(BLOBS_STORE))
      {
        db.createObjectStore(BLOBS_STORE, { keyPath: 'hash' })
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

// report whether the image store is still usable in this session
export const isImageStoreAvailable = (): boolean => !indexedDbUnavailable

// probe the image store once & memoize availability
export const probeImageStore = async (): Promise<boolean> =>
{
  const db = await openDatabaseSafe()
  return db !== null
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

// read many blob records in one transaction
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

  await Promise.all(
    hashes.map(async (hash) =>
    {
      const record = (await awaitRequest(store.get(hash))) as
        | BlobRecord
        | undefined
      results.set(hash, record ?? null)
    })
  )

  await awaitTransaction(tx)
  return results
}
