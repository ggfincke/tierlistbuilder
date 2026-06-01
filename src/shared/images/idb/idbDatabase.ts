// src/shared/images/idb/idbDatabase.ts
// shared image IndexedDB schema, handles, & memory fallbacks

import {
  pruneOldestMapEntries,
  setMapEntryLru,
  touchMapEntry,
} from '~/shared/lib/lru'
import { logger } from '~/shared/lib/logger'

export const DB_NAME = 'tierlistbuilder-images'
// bumped past 5 because main shipped blobs+blobRefs only; this branch still
// needs uploadIndex, so v6 forces a clean upgrade w/ all 3 stores
const DB_VERSION = 6

export const BLOBS_STORE = 'blobs'
export const UPLOAD_INDEX_STORE = 'uploadIndex'
export const BLOB_REFS_STORE = 'blobRefs'
export const BLOB_REFS_BY_SCOPE = 'byScope'
export const UPLOAD_INDEX_BY_HASH = 'byHash'

export const IDB_READ_CONCURRENCY = 8
export const LOCAL_IMAGE_GC_GRACE_MS = 7 * 24 * 60 * 60 * 1000

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

// upload tracking record -> maps [userId, hash] to a cloud media externalId
export interface UploadIndexRecord
{
  userId: string
  hash: string
  cloudMediaExternalId: string
}

export interface BlobRefRecord
{
  id: string
  scope: string
  hash: string
  updatedAt: number
}

export interface ImageStoreReadOptions
{
  signal?: AbortSignal
}

let dbPromise: Promise<IDBDatabase> | null = null
const blobRefWriteQueues = new Map<string, Promise<void>>()

export const memoryBlobs = new Map<string, BlobRecord>()
export const memoryUploadIndex = new Map<string, UploadIndexRecord>()
export const memoryBlobRefs = new Map<string, BlobRefRecord>()

export const uploadIndexKey = (userId: string, hash: string): string =>
  `${userId}|${hash}`

export const touchMemoryBlob = (record: BlobRecord): void =>
{
  memoryBlobs.set(record.hash, record)
  touchMapEntry(memoryBlobs, record.hash)
}

export const touchMemoryUploadIndex = (record: UploadIndexRecord): void =>
{
  setMapEntryLru(
    memoryUploadIndex,
    uploadIndexKey(record.userId, record.hash),
    record,
    MAX_MEMORY_UPLOAD_INDEX
  )
}

export const pruneMemoryCaches = (
  protectedBlobHashes: ReadonlySet<string> = new Set()
): void =>
{
  // hot paths call this on every blob write; skip the ref walk while all caps
  // hold so large imports don't scan up-to-4096 refs for nothing
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

export const openDatabaseSafe = async (): Promise<IDBDatabase | null> =>
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

export const imageStorageUnavailableError = (): Error =>
  new Error('IndexedDB image storage is unavailable.')

// return true when IDB opens; hard-fail callers gate on this before writes
export const probeImageStore = async (): Promise<boolean> =>
{
  return (await openDatabaseSafe()) !== null
}

export const runBlobRefWrite = (
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
