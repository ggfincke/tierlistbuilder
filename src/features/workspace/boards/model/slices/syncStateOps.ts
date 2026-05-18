// src/features/workspace/boards/model/slices/syncStateOps.ts
// sync-state helpers for the active board data slice

import type { BoardSyncState } from '~/features/workspace/boards/model/sync'

export type BoardSyncStatePatch = Partial<BoardSyncState>

export const createBoardSyncStatePatch = (
  current: BoardSyncState,
  patch: BoardSyncStatePatch
): BoardSyncStatePatch | null =>
{
  const next: BoardSyncStatePatch = {}

  if (
    'lastSyncedRevision' in patch &&
    patch.lastSyncedRevision !== current.lastSyncedRevision
  )
  {
    next.lastSyncedRevision = patch.lastSyncedRevision
  }

  if (
    'cloudBoardExternalId' in patch &&
    patch.cloudBoardExternalId !== current.cloudBoardExternalId
  )
  {
    next.cloudBoardExternalId = patch.cloudBoardExternalId
  }

  if (
    'pendingSyncAt' in patch &&
    patch.pendingSyncAt !== current.pendingSyncAt
  )
  {
    next.pendingSyncAt = patch.pendingSyncAt
  }

  return Object.keys(next).length === 0 ? null : next
}
