// src/app/sync/createAppSyncSession.ts
// app-level sync session: platform connectivity plus workspace adapter startup

import {
  createWorkspaceSyncSession,
  type WorkspaceSyncSession,
} from '~/features/workspace/sync/workspaceSyncSession'
import { useSyncStatusStore } from '~/features/platform/sync/state/syncStatusStore'
import {
  readNavigatorOnline,
  setupConnectivity,
} from '~/features/platform/sync/transport/connectivity'

export interface AppSyncSession
{
  workspace: WorkspaceSyncSession
  triggerResume: () => void
  isMergePending: () => boolean
  dispose: () => void
}

interface CreateAppSyncSessionOptions
{
  userId: string
  shouldProceed: () => boolean
}

export const createAppSyncSession = ({
  userId,
  shouldProceed,
}: CreateAppSyncSessionOptions): AppSyncSession =>
{
  let workspace: WorkspaceSyncSession | null = null

  const triggerResume = (): void =>
  {
    workspace?.triggerResume()
  }

  const disposeConnectivity = setupConnectivity({
    onOnline: triggerResume,
  })

  // gate on navigator.onLine, not the store: setupConnectivity's listeners
  // can lag the OS adapter through StrictMode tear-down/re-mount, leaving
  // the store stuck at false & blocking every flush w/ a spurious offline
  workspace = createWorkspaceSyncSession({
    userId,
    shouldProceed,
    isOnline: readNavigatorOnline,
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
