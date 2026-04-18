// src/features/workspace/settings/data/local/settingsSyncMeta.ts
// localStorage sidecar for cloud sync state of the global settings doc; separate from the settings blob.
// fields: pendingSyncAt, lastSyncedAt, ownerUserId (null on legacy entries before user scoping)

import {
  deleteBrowserStorageItem,
  readBrowserStorageItem,
  writeBrowserStorageItem,
} from '~/shared/lib/browserStorage'
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

export const loadSettingsSyncMeta = (): SettingsSyncMeta =>
{
  const raw = readBrowserStorageItem(SETTINGS_SYNC_META_STORAGE_KEY)
  if (!raw) return { ...EMPTY_SETTINGS_SYNC_META }

  try
  {
    return normalizeSettingsSyncMeta(JSON.parse(raw))
  }
  catch
  {
    return { ...EMPTY_SETTINGS_SYNC_META }
  }
}

export const saveSettingsSyncMeta = (meta: SettingsSyncMeta): void =>
{
  // skip the write entirely when the meta is empty — keeps localStorage tidy
  // for users who never sign in & avoids leaving a dangling key after sign-out
  if (meta.pendingSyncAt === null && meta.lastSyncedAt === null)
  {
    deleteBrowserStorageItem(SETTINGS_SYNC_META_STORAGE_KEY)
    return
  }
  writeBrowserStorageItem(SETTINGS_SYNC_META_STORAGE_KEY, JSON.stringify(meta))
}

export const clearSettingsSyncMeta = (): void =>
  deleteBrowserStorageItem(SETTINGS_SYNC_META_STORAGE_KEY)

export const loadSettingsSyncMetaForUser = (
  userId: string
): SettingsSyncMeta =>
{
  const meta = loadSettingsSyncMeta()
  if (meta.ownerUserId !== null && meta.ownerUserId !== userId)
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
  const scopedCurrent =
    current.ownerUserId !== null && current.ownerUserId !== ownerUserId
      ? {
          ...EMPTY_SETTINGS_SYNC_META,
          ownerUserId,
        }
      : {
          ...current,
          ownerUserId,
        }

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
