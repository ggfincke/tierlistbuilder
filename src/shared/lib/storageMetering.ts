// src/shared/lib/storageMetering.ts
// shared localStorage metering helpers for quota-aware UX

import { getBrowserStorage, readBrowserStorageItem } from './browserStorage'

// estimated localStorage quota in bytes (conservative cross-browser default)
export const STORAGE_QUOTA_BYTES = 5 * 1024 * 1024

// ratio at which a proactive warning is surfaced after a successful save
const STORAGE_WARNING_THRESHOLD = 0.9

// estimate total localStorage usage in bytes (UTF-16 = 2 bytes per char)
export const getStorageUsageBytes = (): number =>
{
  const storage = getBrowserStorage()
  if (!storage)
  {
    return 0
  }

  let chars = 0
  for (let i = 0; i < storage.length; i++)
  {
    const key = storage.key(i)
    if (!key)
    {
      continue
    }

    chars += key.length + (readBrowserStorageItem(key)?.length ?? 0)
  }

  return chars * 2
}

// check whether storage usage is above a warning threshold (0-1)
export const getStorageUsageRatio = (): number =>
{
  const used = getStorageUsageBytes()
  return used / STORAGE_QUOTA_BYTES
}

// return true when storage usage is above the warning threshold
export const isStorageNearFull = (): boolean =>
  getStorageUsageRatio() >= STORAGE_WARNING_THRESHOLD
