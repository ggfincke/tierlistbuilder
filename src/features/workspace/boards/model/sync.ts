// src/features/workspace/boards/model/sync.ts
// shared board sync metadata — mirrored in the active store & persisted per board

import {
  isNonEmptyString,
  isPositiveFiniteNumber,
  isRecord,
} from '~/shared/lib/typeGuards'

export interface BoardSyncState
{
  lastSyncedRevision: number | null
  cloudBoardExternalId: string | null
  // epoch millis stamped when the scheduler queues an edit, cleared on a
  // successful flush. survives tab close so the next session can re-queue
  // any board whose edits never made it to the cloud
  pendingSyncAt: number | null
}

export const EMPTY_BOARD_SYNC_STATE: BoardSyncState = {
  lastSyncedRevision: null,
  cloudBoardExternalId: null,
  pendingSyncAt: null,
}

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
