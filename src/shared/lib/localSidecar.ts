// src/shared/lib/localSidecar.ts
// generic JSON-wrapped localStorage sidecar for per-feature sync-meta trackers
// (settings, tier presets, board deletes); per-sidecar logic stays in its module

import {
  deleteBrowserStorageItem,
  readBrowserStorageItem,
  writeBrowserStorageItem,
} from './browserStorage'

interface LocalSidecarOptions<T>
{
  storageKey: string
  emptyValue: () => T
  normalize: (raw: unknown) => T
  isEmpty: (value: T) => boolean
}

interface LocalSidecar<T>
{
  load: () => T
  save: (value: T) => void
  clear: () => void
}

export const createLocalSidecar = <T>(
  options: LocalSidecarOptions<T>
): LocalSidecar<T> =>
{
  let hasCachedValue = false
  let cachedValue: T = options.emptyValue()

  const setCachedValue = (value: T): T =>
  {
    cachedValue = value
    hasCachedValue = true
    return value
  }

  const parseStoredValue = (raw: string | null): T =>
  {
    if (!raw) return options.emptyValue()
    try
    {
      return options.normalize(JSON.parse(raw))
    }
    catch
    {
      return options.emptyValue()
    }
  }

  if (typeof window !== 'undefined')
  {
    window.addEventListener('storage', (event) =>
    {
      if (event.key === options.storageKey)
      {
        hasCachedValue = false
      }
    })
  }

  const load = (): T =>
  {
    if (hasCachedValue) return cachedValue
    const raw = readBrowserStorageItem(options.storageKey)
    return setCachedValue(parseStoredValue(raw))
  }

  const save = (value: T): void =>
  {
    if (options.isEmpty(value))
    {
      deleteBrowserStorageItem(options.storageKey)
      setCachedValue(options.emptyValue())
      return
    }
    const serialized = JSON.stringify(value)
    writeBrowserStorageItem(options.storageKey, serialized)
    setCachedValue(options.normalize(JSON.parse(serialized)))
  }

  const clear = (): void =>
  {
    deleteBrowserStorageItem(options.storageKey)
    setCachedValue(options.emptyValue())
  }

  return { load, save, clear }
}
