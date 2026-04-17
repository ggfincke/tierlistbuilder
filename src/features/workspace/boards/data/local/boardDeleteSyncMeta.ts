// src/features/workspace/boards/data/local/boardDeleteSyncMeta.ts
// localStorage sidecar for board deletes that haven't yet propagated to the
// cloud. deleteBoardSession runs imperatively (not through the autosave
// subscriber), so w/o a sidecar an offline or pre-sign-in delete would leave
// the cloud row alive forever. on next sign-in to a fresh device the
// soft-deleted-on-this-device board would reappear as active.
//
// no per-user gate at stamp time (deleteBoardSession has no user context).
// the drainer captures userId at install time & fires only when signed in,
// & permanent-failure codes (forbidden / not_found) drop stale entries so
// cross-user leakage is self-healing

import {
  deleteBrowserStorageItem,
  readBrowserStorageItem,
  writeBrowserStorageItem,
} from '~/shared/lib/browserStorage'

export const BOARD_DELETE_SYNC_META_STORAGE_KEY =
  'tier-list-builder-board-delete-sync-meta-v1'

// cap the sidecar size so a pathological offline-w/-errors session can't
// grow unboundedly. oldest entries are dropped on overflow. 500 covers
// real-world delete bursts w/ headroom; each entry is ~40 bytes so the
// whole sidecar stays well under 25KB at the cap
const MAX_PENDING_BOARD_DELETES = 500

export interface BoardDeleteSyncMeta
{
  pendingExternalIds: string[]
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0

const normalizeBoardDeleteSyncMeta = (raw: unknown): BoardDeleteSyncMeta =>
{
  if (!raw || typeof raw !== 'object')
  {
    return { pendingExternalIds: [] }
  }
  const candidate = raw as Partial<Record<keyof BoardDeleteSyncMeta, unknown>>
  const ids = Array.isArray(candidate.pendingExternalIds)
    ? candidate.pendingExternalIds.filter(isNonEmptyString)
    : []
  // dedupe defensively — repeated stamps of the same id during retries
  // would otherwise grow the sidecar unbounded across sessions
  return { pendingExternalIds: Array.from(new Set(ids)) }
}

export const loadBoardDeleteSyncMeta = (): BoardDeleteSyncMeta =>
{
  const raw = readBrowserStorageItem(BOARD_DELETE_SYNC_META_STORAGE_KEY)
  if (!raw) return { pendingExternalIds: [] }

  try
  {
    return normalizeBoardDeleteSyncMeta(JSON.parse(raw))
  }
  catch
  {
    return { pendingExternalIds: [] }
  }
}

const saveBoardDeleteSyncMeta = (meta: BoardDeleteSyncMeta): void =>
{
  if (meta.pendingExternalIds.length === 0)
  {
    deleteBrowserStorageItem(BOARD_DELETE_SYNC_META_STORAGE_KEY)
    return
  }
  writeBrowserStorageItem(
    BOARD_DELETE_SYNC_META_STORAGE_KEY,
    JSON.stringify(meta)
  )
}

// stamp a cloud-board-externalId as awaiting deletion. idempotent & bounded:
// duplicate stamps no-op; overflow past the cap drops the oldest entry
export const stampPendingBoardDelete = (
  cloudBoardExternalId: string
): BoardDeleteSyncMeta =>
{
  const current = loadBoardDeleteSyncMeta()
  if (current.pendingExternalIds.includes(cloudBoardExternalId))
  {
    return current
  }
  const appended = [...current.pendingExternalIds, cloudBoardExternalId]
  const trimmed =
    appended.length > MAX_PENDING_BOARD_DELETES
      ? appended.slice(appended.length - MAX_PENDING_BOARD_DELETES)
      : appended
  const next: BoardDeleteSyncMeta = { pendingExternalIds: trimmed }
  saveBoardDeleteSyncMeta(next)
  return next
}

// remove a cloud-board-externalId after a successful delete-flush
export const clearPendingBoardDelete = (
  cloudBoardExternalId: string
): BoardDeleteSyncMeta =>
{
  const current = loadBoardDeleteSyncMeta()
  if (!current.pendingExternalIds.includes(cloudBoardExternalId))
  {
    return current
  }
  const next: BoardDeleteSyncMeta = {
    pendingExternalIds: current.pendingExternalIds.filter(
      (id) => id !== cloudBoardExternalId
    ),
  }
  saveBoardDeleteSyncMeta(next)
  return next
}
