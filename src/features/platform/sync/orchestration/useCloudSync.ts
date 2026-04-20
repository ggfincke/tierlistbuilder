// src/features/platform/sync/orchestration/useCloudSync.ts
// thin coordinator: wires epoch, handle registry, session, & board-data subscriber

import { useEffect, useRef } from 'react'
import type { PublicUserMe } from '@tierlistbuilder/contracts/platform/user'
import { getUserStableId } from '~/features/platform/auth/model/userIdentity'
import { useConflictQueueStore } from '~/features/workspace/boards/data/cloud/conflicts/useConflictQueueStore'
import { useSyncStatusStore } from '~/features/platform/sync/state/syncStatusStore'
import { useSyncEpoch } from './useSyncEpoch'
import { useHandleRegistry } from './useHandleRegistry'
import { useBoardDataSubscriber } from './useBoardDataSubscriber'
import { createSyncSession, type SyncSession } from './createSyncSession'

export const useCloudSync = (user: PublicUserMe | null): void =>
{
  const userId = user ? getUserStableId(user) : null
  const epoch = useSyncEpoch(userId)
  const handles = useHandleRegistry()
  const sessionRef = useRef<SyncSession | null>(null)

  useEffect(() =>
  {
    if (!epoch)
    {
      sessionRef.current = null
      return
    }

    // fresh sign-in starts w/ no carry-over conflicts or stale per-board
    // statuses. clears defensively in case sign-out raced w/ in-flight
    // resolution (the cleanup also clears both stores)
    useConflictQueueStore.getState().clear()
    useSyncStatusStore.getState().clear()

    const session = createSyncSession({
      userId: epoch.capturedUserId,
      shouldProceed: epoch.shouldProceed,
      handles,
    })
    sessionRef.current = session

    return () =>
    {
      session.dispose()
      handles.disposeAll()
      sessionRef.current = null

      // sign-out / user switch — drop pending conflicts & per-board sync
      // statuses for the previous user so a different sign-in doesn't
      // surface stale modal entries or stale indicator chrome
      useConflictQueueStore.getState().clear()
      useSyncStatusStore.getState().clear()
    }
    // epoch identity is pinned per userId in useSyncEpoch & handles is stable,
    // so Convex user-doc re-renders (tier/image/auth-lib patches) don't tear
    // down the entire sync stack
  }, [epoch, handles])

  useBoardDataSubscriber({
    shouldProceed: epoch?.shouldProceed ?? null,
    isMergePending: () => sessionRef.current?.isMergePending() ?? false,
    onEdit: (work) => sessionRef.current?.scheduler.queue(work),
  })
}
