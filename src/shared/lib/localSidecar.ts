// src/shared/lib/localSidecar.ts
// generic JSON-wrapped localStorage sidecar for per-feature sync-meta trackers
// (settings, tier presets, board deletes); per-sidecar logic stays in its module

import {
  deleteBrowserStorageItem,
  readBrowserStorageItem,
  writeBrowserStorageItem,
} from './browserStorage'

export interface LocalSidecarOptions<T>
{
  storageKey: string
  emptyValue: () => T
  normalize: (raw: unknown) => T
  isEmpty: (value: T) => boolean
}

export interface LocalSidecar<T>
{
  load: () => T
  save: (value: T) => void
  clear: () => void
}

export const createLocalSidecar = <T>(
  options: LocalSidecarOptions<T>
): LocalSidecar<T> =>
{
  const load = (): T =>
  {
    const raw = readBrowserStorageItem(options.storageKey)
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

  const save = (value: T): void =>
  {
    if (options.isEmpty(value))
    {
      deleteBrowserStorageItem(options.storageKey)
      return
    }
    writeBrowserStorageItem(options.storageKey, JSON.stringify(value))
  }

  const clear = (): void => deleteBrowserStorageItem(options.storageKey)

  return { load, save, clear }
}
