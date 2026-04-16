// src/features/platform/sync/boardSyncStatus.ts
// pure sync-status taxonomy & priority rules shared by hooks, UI, & tests

export type StoredBoardSyncStatus = 'idle' | 'syncing' | 'error'

export type EffectiveBoardSyncStatus =
  | StoredBoardSyncStatus
  | 'conflict'
  | 'offline'

interface ResolveBoardSyncStatusOptions
{
  online: boolean
  storedStatus: StoredBoardSyncStatus
  hasConflict: boolean
}

export const resolveBoardSyncStatus = ({
  online,
  storedStatus,
  hasConflict,
}: ResolveBoardSyncStatusOptions): EffectiveBoardSyncStatus =>
{
  if (hasConflict)
  {
    return 'conflict'
  }

  if (storedStatus === 'error' || storedStatus === 'syncing')
  {
    return online ? storedStatus : 'offline'
  }

  return 'idle'
}
