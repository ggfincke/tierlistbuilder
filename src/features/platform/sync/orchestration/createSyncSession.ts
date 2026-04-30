// src/features/platform/sync/orchestration/createSyncSession.ts
// platform sync session: connectivity wiring & workspace adapter startup

import {
  createWorkspaceSyncSession,
  type WorkspaceSyncSession,
} from '~/features/workspace/sync/workspaceSyncSession'
import { useSyncStatusStore } from '~/features/platform/sync/state/syncStatusStore'
import { setupConnectivity } from '~/features/platform/sync/transport/connectivity'

export interface SyncSession
{
  workspace: WorkspaceSyncSession
  triggerResume: () => void
  isMergePending: () => boolean
  dispose: () => void
}

export interface CreateSyncSessionOptions
{
  userId: string
  shouldProceed: () => boolean
}

export const createSyncSession = ({
  userId,
  shouldProceed,
}: CreateSyncSessionOptions): SyncSession =>
{
  let workspace: WorkspaceSyncSession | null = null

  const triggerResume = (): void =>
  {
    workspace?.triggerResume()
  }

  const disposeConnectivity = setupConnectivity({
    onOnline: triggerResume,
  })

  workspace = createWorkspaceSyncSession({
    userId,
    shouldProceed,
    isOnline: () => useSyncStatusStore.getState().online,
    setBoardStatus: (boardId, status) =>
    {
      useSyncStatusStore.getState().setBoardStatus(boardId, status)
    },
  })

  const dispose = (): void =>
  {
    workspace?.dispose()
    disposeConnectivity()
  }

  return {
    workspace,
    triggerResume,
    isMergePending: () => workspace?.isMergePending() ?? false,
    dispose,
  }
}
