// src/features/platform/sync/orchestration/useCloudSync.ts
// thin coordinator: wires auth epoch, platform session, & workspace subscriber

import { useEffect, useRef } from 'react'
import type { PublicUserMe } from '@tierlistbuilder/contracts/platform/user'
import { getUserStableId } from '~/features/platform/auth/model/userIdentity'
import {
  clearWorkspaceSyncState,
  type WorkspaceSyncSession,
} from '~/features/workspace/sync/workspaceSyncSession'
import { useWorkspaceBoardSyncSubscriber } from '~/features/workspace/sync/useWorkspaceBoardSyncSubscriber'
import { useSyncStatusStore } from '~/features/platform/sync/state/syncStatusStore'
import { useSyncEpoch } from './useSyncEpoch'
import { createSyncSession, type SyncSession } from './createSyncSession'

export const useCloudSync = (user: PublicUserMe | null): void =>
{
  const userId = user ? getUserStableId(user) : null
  const epoch = useSyncEpoch(userId)
  const sessionRef = useRef<SyncSession | null>(null)

  useEffect(() =>
  {
    if (!epoch)
    {
      sessionRef.current = null
      return
    }

    clearWorkspaceSyncState()
    useSyncStatusStore.getState().clear()

    const session = createSyncSession({
      userId: epoch.capturedUserId,
      shouldProceed: epoch.shouldProceed,
    })
    sessionRef.current = session

    return () =>
    {
      session.dispose()
      sessionRef.current = null

      clearWorkspaceSyncState()
      useSyncStatusStore.getState().clear()
    }
  }, [epoch])

  const getWorkspaceSession = (): WorkspaceSyncSession | null =>
    sessionRef.current?.workspace ?? null

  useWorkspaceBoardSyncSubscriber({
    shouldProceed: epoch?.shouldProceed ?? null,
    isMergePending: () => getWorkspaceSession()?.isMergePending() ?? false,
    onEdit: (work) => getWorkspaceSession()?.queueBoard(work),
  })
}
