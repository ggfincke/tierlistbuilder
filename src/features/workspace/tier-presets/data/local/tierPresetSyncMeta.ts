// src/features/workspace/tier-presets/data/local/tierPresetSyncMeta.ts
// localStorage sidecar tracking cloud sync state per user-saved preset.
// keyed by UserPresetId, w/ one entry per preset that's been edited
// locally but not yet flushed (or has been flushed in the past).
//
// shape semantics per entry:
//   pendingOp     — the kind of mutation queued: 'upsert' for added or
//                   modified presets, 'delete' for tombstones (preset
//                   removed locally but the cloud delete hasn't landed).
//                   null after a successful flush
//   pendingSyncAt — wall-clock millis stamped when an op was queued. survives
//                   tab close so resumePendingSyncs can replay the op
//   lastSyncedAt  — wall-clock millis of the last successful cloud landing,
//                   independent of pendingOp. used to decide direction in
//                   the first-login merge (presence implies "we've pushed
//                   this preset before; cloud version was authoritative")
//   ownerUserId   — stable user id for the session that stamped this entry;
//                   null on legacy entries written before user scoping landed
//
// op model is intentionally 2-state (not create/update/delete): the server's
// createTierPreset mutation upserts on conflict, so the client never needs
// to distinguish first push from subsequent updates

import type { UserPresetId } from '@tierlistbuilder/contracts/lib/ids'
import {
  deleteBrowserStorageItem,
  readBrowserStorageItem,
  writeBrowserStorageItem,
} from '~/shared/lib/browserStorage'

export const TIER_PRESET_SYNC_META_STORAGE_KEY =
  'tier-list-builder-tier-preset-sync-meta-v1'

export type TierPresetPendingOp = 'upsert' | 'delete'

export interface TierPresetSyncMetaEntry
{
  pendingOp: TierPresetPendingOp | null
  pendingSyncAt: number | null
  lastSyncedAt: number | null
  ownerUserId: string | null
}

export type TierPresetSyncMetaMap = Record<
  UserPresetId,
  TierPresetSyncMetaEntry
>

const EMPTY_ENTRY: TierPresetSyncMetaEntry = {
  pendingOp: null,
  pendingSyncAt: null,
  lastSyncedAt: null,
  ownerUserId: null,
}

const isFiniteMillis = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

const isPendingOp = (value: unknown): value is TierPresetPendingOp =>
  value === 'upsert' || value === 'delete'

const isUserId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0

const normalizeEntry = (raw: unknown): TierPresetSyncMetaEntry =>
{
  if (!raw || typeof raw !== 'object')
  {
    return { ...EMPTY_ENTRY }
  }
  const candidate = raw as Partial<
    Record<keyof TierPresetSyncMetaEntry, unknown>
  >
  return {
    pendingOp: isPendingOp(candidate.pendingOp) ? candidate.pendingOp : null,
    pendingSyncAt: isFiniteMillis(candidate.pendingSyncAt)
      ? candidate.pendingSyncAt
      : null,
    lastSyncedAt: isFiniteMillis(candidate.lastSyncedAt)
      ? candidate.lastSyncedAt
      : null,
    ownerUserId: isUserId(candidate.ownerUserId) ? candidate.ownerUserId : null,
  }
}

const isUserPresetId = (value: unknown): value is UserPresetId =>
  typeof value === 'string' && value.startsWith('preset-')

const normalizeMap = (raw: unknown): TierPresetSyncMetaMap =>
{
  if (!raw || typeof raw !== 'object')
  {
    return {}
  }

  const map: TierPresetSyncMetaMap = {}
  for (const [key, value] of Object.entries(raw))
  {
    if (!isUserPresetId(key))
    {
      continue
    }
    const entry = normalizeEntry(value)
    // skip entries that decay to fully-empty after normalization — keeps
    // map size bounded across migrations & malformed legacy writes
    if (
      entry.pendingOp === null &&
      entry.pendingSyncAt === null &&
      entry.lastSyncedAt === null
    )
    {
      continue
    }
    map[key] = entry
  }
  return map
}

export const loadTierPresetSyncMetaMap = (): TierPresetSyncMetaMap =>
{
  const raw = readBrowserStorageItem(TIER_PRESET_SYNC_META_STORAGE_KEY)
  if (!raw) return {}

  try
  {
    return normalizeMap(JSON.parse(raw))
  }
  catch
  {
    return {}
  }
}

export const loadTierPresetSyncMetaMapForUser = (
  userId: string
): TierPresetSyncMetaMap =>
{
  const map = loadTierPresetSyncMetaMap()
  const filtered: TierPresetSyncMetaMap = {}

  for (const [presetId, entry] of Object.entries(map) as Array<
    [UserPresetId, TierPresetSyncMetaEntry]
  >)
  {
    if (entry.ownerUserId !== null && entry.ownerUserId !== userId)
    {
      continue
    }
    filtered[presetId] = entry
  }

  return filtered
}

export const saveTierPresetSyncMetaMap = (map: TierPresetSyncMetaMap): void =>
{
  if (Object.keys(map).length === 0)
  {
    deleteBrowserStorageItem(TIER_PRESET_SYNC_META_STORAGE_KEY)
    return
  }
  writeBrowserStorageItem(
    TIER_PRESET_SYNC_META_STORAGE_KEY,
    JSON.stringify(map)
  )
}

export const clearAllTierPresetSyncMeta = (): void =>
  deleteBrowserStorageItem(TIER_PRESET_SYNC_META_STORAGE_KEY)

const isFullyEmpty = (entry: TierPresetSyncMetaEntry): boolean =>
  entry.pendingOp === null &&
  entry.pendingSyncAt === null &&
  entry.lastSyncedAt === null

const scopeEntryToOwner = (
  entry: TierPresetSyncMetaEntry,
  ownerUserId: string
): TierPresetSyncMetaEntry =>
{
  if (entry.ownerUserId !== null && entry.ownerUserId !== ownerUserId)
  {
    return {
      ...EMPTY_ENTRY,
      ownerUserId,
    }
  }

  return {
    ...entry,
    ownerUserId,
  }
}

// merge a partial entry update into the map for one preset. dropping
// fields w/ undefined preserves them; pass explicit null to clear
export const upsertTierPresetSyncMeta = (
  presetId: UserPresetId,
  patch: Partial<TierPresetSyncMetaEntry>
): TierPresetSyncMetaEntry =>
{
  const map = loadTierPresetSyncMetaMap()
  const current = map[presetId] ?? { ...EMPTY_ENTRY }
  const next: TierPresetSyncMetaEntry = {
    pendingOp:
      patch.pendingOp !== undefined ? patch.pendingOp : current.pendingOp,
    pendingSyncAt:
      patch.pendingSyncAt !== undefined
        ? patch.pendingSyncAt
        : current.pendingSyncAt,
    lastSyncedAt:
      patch.lastSyncedAt !== undefined
        ? patch.lastSyncedAt
        : current.lastSyncedAt,
    ownerUserId:
      patch.ownerUserId !== undefined ? patch.ownerUserId : current.ownerUserId,
  }

  // if the merged entry is entirely cleared, drop it from the map. keeps
  // the on-disk shape minimal for users w/ thousands of historical edits
  if (isFullyEmpty(next))
  {
    delete map[presetId]
  }
  else
  {
    map[presetId] = next
  }

  saveTierPresetSyncMetaMap(map)
  return next
}

export const removeTierPresetSyncMeta = (presetId: UserPresetId): void =>
{
  const map = loadTierPresetSyncMetaMap()
  if (!(presetId in map))
  {
    return
  }
  delete map[presetId]
  saveTierPresetSyncMetaMap(map)
}

// stamp a fresh pending op for one preset. preserves any prior lastSyncedAt
// (so the merge flow can still distinguish "never synced" from "edited after
// last sync"). idempotent for the same op kind: repeated stamps during the
// debounce window keep the original pendingSyncAt.
//
// op promotion: a queued 'upsert' followed by a 'delete' for a preset that
// has never landed in the cloud (lastSyncedAt === null) drops the entry
// entirely — there's nothing to push & no cloud row to delete
export const stampTierPresetPending = (
  presetId: UserPresetId,
  op: TierPresetPendingOp,
  ownerUserId: string,
  now: number = Date.now()
): TierPresetSyncMetaEntry =>
{
  const map = loadTierPresetSyncMetaMap()
  const current = scopeEntryToOwner(
    map[presetId] ?? { ...EMPTY_ENTRY },
    ownerUserId
  )

  if (
    current.pendingOp === 'upsert' &&
    op === 'delete' &&
    current.lastSyncedAt === null
  )
  {
    delete map[presetId]
    saveTierPresetSyncMetaMap(map)
    return { ...EMPTY_ENTRY }
  }

  const isSameOp = current.pendingOp === op
  const next: TierPresetSyncMetaEntry = {
    pendingOp: op,
    pendingSyncAt:
      isSameOp && current.pendingSyncAt !== null ? current.pendingSyncAt : now,
    lastSyncedAt: current.lastSyncedAt,
    ownerUserId,
  }
  map[presetId] = next
  saveTierPresetSyncMetaMap(map)
  return next
}

export const markTierPresetSynced = (
  presetId: UserPresetId,
  ownerUserId: string,
  syncedAt: number = Date.now()
): TierPresetSyncMetaEntry =>
{
  return upsertTierPresetSyncMeta(presetId, {
    pendingOp: null,
    pendingSyncAt: null,
    lastSyncedAt: syncedAt,
    ownerUserId,
  })
}

// drop the entry entirely after a successful delete-flush — the cloud row
// is gone & we no longer need to remember anything about this preset
export const purgeTierPresetSyncMeta = removeTierPresetSyncMeta
