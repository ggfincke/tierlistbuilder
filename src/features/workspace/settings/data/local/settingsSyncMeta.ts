// src/features/workspace/settings/data/local/settingsSyncMeta.ts
// localStorage sidecar for cloud sync state of the global settings doc — separate
// from the settings blob. fields: pendingSyncAt, lastSyncedAt, ownerUserId

import { createLocalSidecar } from '~/shared/lib/localSidecar'
import {
  EMPTY_OWNED_SYNC_META,
  clearOwnedSyncPending,
  isOwnedSyncMetaEmpty,
  markOwnedSyncSynced,
  normalizeOwnedSyncMeta,
  scopeOwnedSyncMeta,
  stampOwnedSyncPending,
  type OwnedSyncMeta,
} from '~/shared/lib/sync/ownedSyncMeta'

export const SETTINGS_SYNC_META_STORAGE_KEY =
  'tier-list-builder-settings-sync-meta-v2'

export type SettingsSyncMeta = OwnedSyncMeta

export const EMPTY_SETTINGS_SYNC_META: SettingsSyncMeta = {
  ...EMPTY_OWNED_SYNC_META,
}

const normalizeSettingsSyncMeta = (raw: unknown): SettingsSyncMeta =>
  normalizeOwnedSyncMeta(raw)

const sidecar = createLocalSidecar<SettingsSyncMeta>({
  storageKey: SETTINGS_SYNC_META_STORAGE_KEY,
  emptyValue: () => ({ ...EMPTY_SETTINGS_SYNC_META }),
  normalize: normalizeSettingsSyncMeta,
  // ownerUserId alone doesn't justify keeping the sidecar — w/o a pending
  // or last-synced timestamp there's nothing to recover from it
  isEmpty: isOwnedSyncMetaEmpty,
})

export const loadSettingsSyncMeta = sidecar.load
export const saveSettingsSyncMeta = sidecar.save
export const clearSettingsSyncMeta = sidecar.clear

export const loadSettingsSyncMetaForUser = (
  userId: string
): SettingsSyncMeta =>
{
  const meta = loadSettingsSyncMeta()
  if (meta.ownerUserId !== userId)
  {
    return { ...EMPTY_SETTINGS_SYNC_META }
  }
  return meta
}

// stamp pendingSyncAt to now if it isn't already set, leaving lastSyncedAt
// untouched. idempotent — repeated edits during the debounce window only
// stamp once. returns the resulting meta so callers don't need a re-read
export const stampSettingsPending = (
  ownerUserId: string,
  now: number = Date.now()
): SettingsSyncMeta =>
{
  const current = loadSettingsSyncMeta()
  const scopedCurrent = scopeOwnedSyncMeta(
    current,
    () => ({ ...EMPTY_SETTINGS_SYNC_META }),
    ownerUserId
  )
  const next = stampOwnedSyncPending(scopedCurrent, now)

  if (next === scopedCurrent)
  {
    return scopedCurrent
  }

  saveSettingsSyncMeta(next)
  return next
}

// clear pendingSyncAt & advance lastSyncedAt — the success path
export const markSettingsSynced = (
  ownerUserId: string,
  syncedAt: number = Date.now()
): SettingsSyncMeta =>
{
  const next = markOwnedSyncSynced(
    { ...EMPTY_SETTINGS_SYNC_META },
    ownerUserId,
    syncedAt
  )
  saveSettingsSyncMeta(next)
  return next
}

// clear pendingSyncAt w/o advancing lastSyncedAt — used when the runner
// dedup bails: cloud is already at the current value so no new sync happened
export const clearSettingsPending = (ownerUserId: string): SettingsSyncMeta =>
{
  const current = loadSettingsSyncMeta()
  if (current.ownerUserId !== ownerUserId)
  {
    return { ...EMPTY_SETTINGS_SYNC_META }
  }
  if (current.pendingSyncAt === null)
  {
    return current
  }
  const next = clearOwnedSyncPending({ ...current, ownerUserId })
  saveSettingsSyncMeta(next)
  return next
}
