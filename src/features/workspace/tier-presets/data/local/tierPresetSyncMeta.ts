// src/features/workspace/tier-presets/data/local/tierPresetSyncMeta.ts
// localStorage sidecar tracking cloud sync state per user-saved preset (keyed by UserPresetId).
// fields: pendingOp ('upsert'|'delete'|null), pendingSyncAt, lastSyncedAt, ownerUserId

import {
  isUserPresetId,
  type UserPresetId,
} from '@tierlistbuilder/contracts/lib/ids'
import { createLocalSidecar } from '~/shared/lib/localSidecar'
import {
  isNonEmptyString,
  isPositiveFiniteNumber,
} from '~/shared/lib/typeGuards'

export const TIER_PRESET_SYNC_META_STORAGE_KEY =
  'tier-list-builder-tier-preset-sync-meta-v2'

export type TierPresetPendingOp = 'upsert' | 'delete'

export interface TierPresetSyncMetaEntry
{
  pendingOp: TierPresetPendingOp | null
  pendingSyncAt: number | null
  lastSyncedAt: number | null
  ownerUserId: string
}

export type TierPresetSyncMetaMap = Record<
  UserPresetId,
  TierPresetSyncMetaEntry
>

const EMPTY_ENTRY: TierPresetSyncMetaEntry = {
  pendingOp: null,
  pendingSyncAt: null,
  lastSyncedAt: null,
  ownerUserId: '',
}

const isPendingOp = (value: unknown): value is TierPresetPendingOp =>
  value === 'upsert' || value === 'delete'

const isFullyEmpty = (entry: TierPresetSyncMetaEntry): boolean =>
  entry.pendingOp === null &&
  entry.pendingSyncAt === null &&
  entry.lastSyncedAt === null

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
    pendingSyncAt: isPositiveFiniteNumber(candidate.pendingSyncAt)
      ? candidate.pendingSyncAt
      : null,
    lastSyncedAt: isPositiveFiniteNumber(candidate.lastSyncedAt)
      ? candidate.lastSyncedAt
      : null,
    ownerUserId: isNonEmptyString(candidate.ownerUserId)
      ? candidate.ownerUserId
      : '',
  }
}

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
    // map size bounded across malformed or half-written local values
    if (isFullyEmpty(entry))
    {
      continue
    }
    map[key] = entry
  }
  return map
}

const sidecar = createLocalSidecar<TierPresetSyncMetaMap>({
  storageKey: TIER_PRESET_SYNC_META_STORAGE_KEY,
  emptyValue: () => ({}),
  normalize: normalizeMap,
  isEmpty: (map) => Object.keys(map).length === 0,
})

export const loadTierPresetSyncMetaMap = sidecar.load
export const saveTierPresetSyncMetaMap = sidecar.save
export const clearAllTierPresetSyncMeta = sidecar.clear

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
    if (entry.ownerUserId !== userId)
    {
      continue
    }
    filtered[presetId] = entry
  }

  return filtered
}

const scopeEntryToOwner = (
  entry: TierPresetSyncMetaEntry,
  ownerUserId: string
): TierPresetSyncMetaEntry =>
{
  if (entry.ownerUserId !== ownerUserId)
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

// stamp a fresh pending op for one preset. idempotent per op kind; always
// plays the op sequence out (incl upsert->delete on never-synced presets)
// since optimistic sidecar drop races w/ in-flight upserts (orphan rows)
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

// clear pendingOp & pendingSyncAt w/o advancing lastSyncedAt — used when the
// runner dedup bails: cloud is already at the current value so no new sync
// happened. preserves existing lastSyncedAt so the "last synced" UI is stable
export const clearTierPresetPending = (
  presetId: UserPresetId,
  ownerUserId: string
): TierPresetSyncMetaEntry =>
{
  const map = loadTierPresetSyncMetaMap()
  const current = map[presetId]
  if (!current || current.ownerUserId !== ownerUserId)
  {
    return { ...EMPTY_ENTRY }
  }
  if (current.pendingOp === null && current.pendingSyncAt === null)
  {
    return current
  }
  return upsertTierPresetSyncMeta(presetId, {
    pendingOp: null,
    pendingSyncAt: null,
    ownerUserId,
  })
}
