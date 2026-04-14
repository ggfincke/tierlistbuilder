// src/shared/lib/browserStorage.ts
// shared browser storage wrappers & Zustand persist adapter helpers

import {
  createJSONStorage,
  type PersistStorage,
  type StateStorage,
} from 'zustand/middleware'

export const getBrowserStorage = (): Storage | null =>
{
  if (typeof localStorage === 'undefined')
  {
    return null
  }

  return localStorage
}

// detect whether an error is a localStorage quota-exceeded error
export const isStorageQuotaError = (error: unknown): boolean =>
  error instanceof DOMException &&
  (error.name === 'QuotaExceededError' ||
    error.code === 22 ||
    error.code === 1014)

export const readBrowserStorageItem = (key: string): string | null =>
{
  try
  {
    return getBrowserStorage()?.getItem(key) ?? null
  }
  catch
  {
    return null
  }
}

export const writeBrowserStorageItem = (key: string, value: string): void =>
{
  try
  {
    getBrowserStorage()?.setItem(key, value)
  }
  catch
  {
    // no-op
  }
}

export const deleteBrowserStorageItem = (key: string): void =>
{
  try
  {
    getBrowserStorage()?.removeItem(key)
  }
  catch
  {
    // no-op
  }
}

const appStateStorage: StateStorage = {
  getItem: (key) => readBrowserStorageItem(key),
  setItem: (key, value) => writeBrowserStorageItem(key, value),
  removeItem: (key) => deleteBrowserStorageItem(key),
}

export const createAppPersistStorage = <S>(): PersistStorage<S> =>
  createJSONStorage<S>(() => appStateStorage)!
