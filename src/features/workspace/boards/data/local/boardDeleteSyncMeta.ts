// src/features/workspace/boards/data/local/boardDeleteSyncMeta.ts
// localStorage sidecar for board deletes not yet propagated to the cloud.
// permanent-failure codes drop stale entries; w/o this sidecar offline deletes leave cloud rows alive

import { createLocalSidecar } from '~/shared/lib/localSidecar'
import { isNonEmptyString } from '~/shared/lib/typeGuards'

export const BOARD_DELETE_SYNC_META_STORAGE_KEY =
  'tier-list-builder-board-delete-sync-meta-v1'

// cap sidecar size; oldest entries dropped on overflow. 500 entries covers real-world
// delete bursts w/ headroom (~25KB total at ~40 bytes/entry)
const MAX_PENDING_BOARD_DELETES = 500

export interface BoardDeleteSyncMeta
{
  pendingExternalIds: string[]
}

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

const sidecar = createLocalSidecar<BoardDeleteSyncMeta>({
  storageKey: BOARD_DELETE_SYNC_META_STORAGE_KEY,
  emptyValue: () => ({ pendingExternalIds: [] }),
  normalize: normalizeBoardDeleteSyncMeta,
  isEmpty: (meta) => meta.pendingExternalIds.length === 0,
})

export const loadBoardDeleteSyncMeta = sidecar.load

// stamp a cloud-board-externalId as awaiting deletion. idempotent & bounded:
// duplicate stamps no-op; overflow past the cap drops the oldest entry
export const stampPendingBoardDelete = (
  cloudBoardExternalId: string
): BoardDeleteSyncMeta =>
{
  const current = sidecar.load()
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
  sidecar.save(next)
  return next
}

// remove a cloud-board-externalId after a successful delete-flush
export const clearPendingBoardDelete = (
  cloudBoardExternalId: string
): BoardDeleteSyncMeta =>
{
  const current = sidecar.load()
  if (!current.pendingExternalIds.includes(cloudBoardExternalId))
  {
    return current
  }
  const next: BoardDeleteSyncMeta = {
    pendingExternalIds: current.pendingExternalIds.filter(
      (id) => id !== cloudBoardExternalId
    ),
  }
  sidecar.save(next)
  return next
}
