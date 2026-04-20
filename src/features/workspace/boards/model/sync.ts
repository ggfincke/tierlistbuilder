// src/features/workspace/boards/model/sync.ts
// helpers around the BoardSyncState contract — empty value, normalize, & post-flush marker

import type { BoardSyncState } from '@tierlistbuilder/contracts/workspace/boardSync'
import {
  isNonEmptyString,
  isPositiveFiniteNumber,
  isRecord,
} from '~/shared/lib/typeGuards'

export type { BoardSyncState }

export const EMPTY_BOARD_SYNC_STATE: BoardSyncState = {
  lastSyncedRevision: null,
  cloudBoardExternalId: null,
  pendingSyncAt: null,
}

// fresh sync state after a successful cloud push or pull — pinned revision &
// external id w/ pending marker cleared. used wherever a flush/pull settles
export const markBoardSynced = (
  revision: number,
  cloudBoardExternalId: string
): BoardSyncState => ({
  lastSyncedRevision: revision,
  cloudBoardExternalId,
  pendingSyncAt: null,
})

export const markBoardPendingSync = (
  value: BoardSyncState,
  pendingSyncAt: number = Date.now()
): BoardSyncState => ({
  ...value,
  pendingSyncAt: value.pendingSyncAt ?? pendingSyncAt,
})

export const extractBoardSyncState = (
  value: Pick<
    BoardSyncState,
    'lastSyncedRevision' | 'cloudBoardExternalId' | 'pendingSyncAt'
  >
): BoardSyncState => ({
  lastSyncedRevision: value.lastSyncedRevision,
  cloudBoardExternalId: value.cloudBoardExternalId,
  pendingSyncAt: value.pendingSyncAt,
})

export const normalizeBoardSyncState = (value: unknown): BoardSyncState =>
{
  if (!isRecord(value))
  {
    return EMPTY_BOARD_SYNC_STATE
  }

  return {
    lastSyncedRevision:
      typeof value.lastSyncedRevision === 'number' &&
      Number.isFinite(value.lastSyncedRevision)
        ? value.lastSyncedRevision
        : null,
    cloudBoardExternalId: isNonEmptyString(value.cloudBoardExternalId)
      ? value.cloudBoardExternalId
      : null,
    pendingSyncAt: isPositiveFiniteNumber(value.pendingSyncAt)
      ? value.pendingSyncAt
      : null,
  }
}
