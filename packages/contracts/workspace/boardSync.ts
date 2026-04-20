// packages/contracts/workspace/boardSync.ts
// per-board cloud sync metadata — persisted in local sidecar & mirrored on the active store

export interface BoardSyncState
{
  lastSyncedRevision: number | null
  cloudBoardExternalId: string | null
  pendingSyncAt: number | null
}
