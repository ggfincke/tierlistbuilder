// src/features/workspace/settings/data/local/settingsSyncMeta.ts
// localStorage sidecar for cloud sync state of the global settings doc — separate
// from the settings blob. fields: pendingSyncAt, lastSyncedAt, ownerUserId

import { createLocalSidecar, isOwnedByUser } from '~/shared/lib/localSidecar'
import {
  isNonEmptyString,
  isPositiveFiniteNumber,
} from '~/shared/lib/typeGuards'

export const SETTINGS_SYNC_META_STORAGE_KEY =
  'tier-list-builder-settings-sync-meta-v1'

export interface SettingsSyncMeta
{
  pendingSyncAt: number | null
  lastSyncedAt: number | null
  ownerUserId: string | null
}

export const EMPTY_SETTINGS_SYNC_META: SettingsSyncMeta = {
  pendingSyncAt: null,
  lastSyncedAt: null,
  ownerUserId: null,
}

const normalizeSettingsSyncMeta = (raw: unknown): SettingsSyncMeta =>
{
  if (!raw || typeof raw !== 'object')
  {
    return { ...EMPTY_SETTINGS_SYNC_META }
  }

  const candidate = raw as Partial<Record<keyof SettingsSyncMeta, unknown>>
  return {
    pendingSyncAt: isPositiveFiniteNumber(candidate.pendingSyncAt)
      ? candidate.pendingSyncAt
      : null,
    lastSyncedAt: isPositiveFiniteNumber(candidate.lastSyncedAt)
      ? candidate.lastSyncedAt
      : null,
    ownerUserId: isNonEmptyString(candidate.ownerUserId)
      ? candidate.ownerUserId
      : null,
  }
}

const sidecar = createLocalSidecar<SettingsSyncMeta>({
  storageKey: SETTINGS_SYNC_META_STORAGE_KEY,
  emptyValue: () => ({ ...EMPTY_SETTINGS_SYNC_META }),
  normalize: normalizeSettingsSyncMeta,
  // ownerUserId alone doesn't justify keeping the sidecar — w/o a pending
  // or last-synced timestamp there's nothing to recover from it
  isEmpty: (meta) => meta.pendingSyncAt === null && meta.lastSyncedAt === null,
})

export const loadSettingsSyncMeta = sidecar.load
export const saveSettingsSyncMeta = sidecar.save
export const clearSettingsSyncMeta = sidecar.clear

export const loadSettingsSyncMetaForUser = (
  userId: string
): SettingsSyncMeta =>
{
  const meta = loadSettingsSyncMeta()
  if (!isOwnedByUser(meta, userId))
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
  const scopedCurrent = isOwnedByUser(current, ownerUserId)
    ? { ...current, ownerUserId }
    : { ...EMPTY_SETTINGS_SYNC_META, ownerUserId }

  if (scopedCurrent.pendingSyncAt !== null)
  {
    return scopedCurrent
  }
  const next: SettingsSyncMeta = {
    ...scopedCurrent,
    pendingSyncAt: now,
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
  const next: SettingsSyncMeta = {
    pendingSyncAt: null,
    lastSyncedAt: syncedAt,
    ownerUserId,
  }
  saveSettingsSyncMeta(next)
  return next
}

// clear pendingSyncAt w/o advancing lastSyncedAt — used when the runner
// dedup bails: cloud is already at the current value so no new sync happened
export const clearSettingsPending = (ownerUserId: string): SettingsSyncMeta =>
{
  const current = loadSettingsSyncMeta()
  if (!isOwnedByUser(current, ownerUserId))
  {
    return { ...EMPTY_SETTINGS_SYNC_META }
  }
  if (current.pendingSyncAt === null)
  {
    return current
  }
  const next: SettingsSyncMeta = {
    ...current,
    pendingSyncAt: null,
    ownerUserId,
  }
  saveSettingsSyncMeta(next)
  return next
}
