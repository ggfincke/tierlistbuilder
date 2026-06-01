// src/features/workspace/boards/model/cloud/sync.ts
// helpers around the BoardSyncState contract: empty value, normalize, & post-flush marker

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
  pendingSyncOwnerUserId: null,
}

// fresh sync state after a successful cloud push or pull: pinned revision &
// external id w/ pending marker cleared. used wherever a flush/pull settles
export const markBoardSynced = (
  revision: number,
  cloudBoardExternalId: string
): BoardSyncState => ({
  lastSyncedRevision: revision,
  cloudBoardExternalId,
  pendingSyncAt: null,
  pendingSyncOwnerUserId: null,
})

export const markBoardPendingSync = (
  value: BoardSyncState,
  pendingSyncAt: number = Date.now(),
  ownerUserId: string | null = null
): BoardSyncState => ({
  ...value,
  pendingSyncAt: value.pendingSyncAt ?? pendingSyncAt,
  pendingSyncOwnerUserId: ownerUserId ?? value.pendingSyncOwnerUserId,
})

export const clearBoardPendingSync = (
  value: BoardSyncState
): BoardSyncState =>
{
  if (value.pendingSyncAt === null && value.pendingSyncOwnerUserId === null)
  {
    return value
  }

  return {
    ...value,
    pendingSyncAt: null,
    pendingSyncOwnerUserId: null,
  }
}

export const isBoardPendingSyncOwnedBy = (
  value: BoardSyncState,
  ownerUserId: string
): boolean =>
  value.pendingSyncAt !== null && value.pendingSyncOwnerUserId === ownerUserId

export const extractBoardSyncState = (
  value: Pick<
    BoardSyncState,
    | 'lastSyncedRevision'
    | 'cloudBoardExternalId'
    | 'pendingSyncAt'
    | 'pendingSyncOwnerUserId'
  >
): BoardSyncState => ({
  lastSyncedRevision: value.lastSyncedRevision,
  cloudBoardExternalId: value.cloudBoardExternalId,
  pendingSyncAt: value.pendingSyncAt,
  pendingSyncOwnerUserId: value.pendingSyncOwnerUserId,
})

export const normalizeBoardSyncState = (value: unknown): BoardSyncState =>
{
  if (!isRecord(value))
  {
    return EMPTY_BOARD_SYNC_STATE
  }

  const pendingSyncAt = isPositiveFiniteNumber(value.pendingSyncAt)
    ? value.pendingSyncAt
    : null

  return {
    lastSyncedRevision:
      typeof value.lastSyncedRevision === 'number' &&
      Number.isFinite(value.lastSyncedRevision)
        ? value.lastSyncedRevision
        : null,
    cloudBoardExternalId: isNonEmptyString(value.cloudBoardExternalId)
      ? value.cloudBoardExternalId
      : null,
    pendingSyncAt,
    pendingSyncOwnerUserId:
      pendingSyncAt !== null && isNonEmptyString(value.pendingSyncOwnerUserId)
        ? value.pendingSyncOwnerUserId
        : null,
  }
}
