// src/features/platform/preferences/data/local/preferencesSyncMeta.ts
// localStorage sidecar for cloud sync state of the global preferences doc

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

const PREFERENCES_SYNC_META_STORAGE_KEY =
  'tier-list-builder-preferences-sync-meta-v1'

type PreferencesSyncMeta = OwnedSyncMeta

const EMPTY_PREFERENCES_SYNC_META: PreferencesSyncMeta = {
  ...EMPTY_OWNED_SYNC_META,
}

const normalizePreferencesSyncMeta = (raw: unknown): PreferencesSyncMeta =>
  normalizeOwnedSyncMeta(raw)

const sidecar = createLocalSidecar<PreferencesSyncMeta>({
  storageKey: PREFERENCES_SYNC_META_STORAGE_KEY,
  emptyValue: () => ({ ...EMPTY_PREFERENCES_SYNC_META }),
  normalize: normalizePreferencesSyncMeta,
  // ownerUserId alone doesn't justify keeping the sidecar — w/o a pending
  // or last-synced timestamp there's nothing to recover from it
  isEmpty: isOwnedSyncMetaEmpty,
})

export const loadPreferencesSyncMeta = sidecar.load
export const savePreferencesSyncMeta = sidecar.save

export const loadPreferencesSyncMetaForUser = (
  userId: string
): PreferencesSyncMeta =>
{
  const meta = loadPreferencesSyncMeta()
  if (meta.ownerUserId !== userId)
  {
    return { ...EMPTY_PREFERENCES_SYNC_META }
  }
  return meta
}

// stamp pendingSyncAt to now if it isn't already set, leaving lastSyncedAt
// untouched. idempotent — repeated edits during the debounce window only
// stamp once. returns the resulting meta so callers don't need a re-read
export const stampPreferencesPending = (
  ownerUserId: string,
  now: number = Date.now()
): PreferencesSyncMeta =>
{
  const current = loadPreferencesSyncMeta()
  const scopedCurrent = scopeOwnedSyncMeta(
    current,
    () => ({ ...EMPTY_PREFERENCES_SYNC_META }),
    ownerUserId
  )
  const next = stampOwnedSyncPending(scopedCurrent, now)

  if (next === scopedCurrent)
  {
    return scopedCurrent
  }

  savePreferencesSyncMeta(next)
  return next
}

// clear pendingSyncAt & advance lastSyncedAt — the success path
export const markPreferencesSynced = (
  ownerUserId: string,
  syncedAt: number = Date.now()
): PreferencesSyncMeta =>
{
  const next = markOwnedSyncSynced(
    { ...EMPTY_PREFERENCES_SYNC_META },
    ownerUserId,
    syncedAt
  )
  savePreferencesSyncMeta(next)
  return next
}

// clear pendingSyncAt w/o advancing lastSyncedAt — used when the runner
// dedup bails: cloud is already at the current value so no new sync happened
export const clearPreferencesPending = (
  ownerUserId: string
): PreferencesSyncMeta =>
{
  const current = loadPreferencesSyncMeta()
  if (current.ownerUserId !== ownerUserId)
  {
    return { ...EMPTY_PREFERENCES_SYNC_META }
  }
  if (current.pendingSyncAt === null)
  {
    return current
  }
  const next = clearOwnedSyncPending({ ...current, ownerUserId })
  savePreferencesSyncMeta(next)
  return next
}
