// src/shared/images/idb/idbHelpers.ts
// small promise helpers for IndexedDB requests & transactions

export const awaitRequest = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) =>
  {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB request failed.'))
  })

const makeAbortError = (): DOMException =>
  new DOMException('IndexedDB transaction aborted.', 'AbortError')

export const awaitTransaction = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) =>
  {
    tx.oncomplete = () => resolve()
    tx.onerror = () =>
      reject(tx.error ?? new Error('IndexedDB transaction failed.'))
    tx.onabort = () => reject(tx.error ?? makeAbortError())
  })

export const abortTransactionOnSignal = (
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
      // tx may already have completed by the time an abort event lands
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

export const rethrowIfSignalAborted = (
  signal: AbortSignal | undefined,
  fallback: unknown
): void =>
{
  if (!signal?.aborted) return
  throw signal.reason ?? fallback
}

export const awaitIndexDeletes = (
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

export const replaceIndexRecords = (
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
