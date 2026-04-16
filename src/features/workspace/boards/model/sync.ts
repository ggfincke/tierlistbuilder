// src/features/workspace/boards/model/sync.ts
// shared board sync metadata — mirrored in the active store & persisted per board

import { isRecord } from '~/shared/lib/typeGuards'

export interface BoardSyncState
{
  lastSyncedRevision: number | null
  cloudBoardExternalId: string | null
}

export const EMPTY_BOARD_SYNC_STATE: BoardSyncState = {
  lastSyncedRevision: null,
  cloudBoardExternalId: null,
}

export const extractBoardSyncState = (
  value: Pick<BoardSyncState, 'lastSyncedRevision' | 'cloudBoardExternalId'>
): BoardSyncState => ({
  lastSyncedRevision: value.lastSyncedRevision,
  cloudBoardExternalId: value.cloudBoardExternalId,
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
    cloudBoardExternalId:
      typeof value.cloudBoardExternalId === 'string' &&
      value.cloudBoardExternalId.length > 0
        ? value.cloudBoardExternalId
        : null,
  }
}
