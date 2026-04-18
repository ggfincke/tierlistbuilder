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
  // zero-state value returned on miss, corruption, or legacy mismatches
  emptyValue: () => T
  // coerce an unknown (parsed JSON) into a valid T; must never throw &
  // must default invalid fields rather than propagate garbage
  normalize: (raw: unknown) => T
  // bail the write path when the value has nothing worth persisting — keeps
  // localStorage tidy for users w/ no sync state & avoids leaving `{}` blobs
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

// shared scope predicate — true when the entry's ownerUserId matches the
// current user, or is null (legacy marker from before user scoping landed).
// used by settings & tier-preset sidecars; board-delete sidecar is unscoped
export const isOwnedByUser = <T extends { ownerUserId: string | null }>(
  entry: T,
  userId: string
): boolean => entry.ownerUserId === null || entry.ownerUserId === userId
