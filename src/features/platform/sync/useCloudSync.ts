// src/features/platform/sync/useCloudSync.ts
// top-level cloud sync subscriber — gated on signed-in status,
// debounces board changes to Convex mutations

import { useEffect, useRef } from 'react'
import type { Doc } from '@convex/_generated/dataModel'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import {
  boardDataFieldsEqual,
  extractBoardData,
  selectBoardDataFields,
} from '~/features/workspace/boards/model/boardSnapshot'
import { extractBoardSyncState } from '~/features/workspace/boards/model/sync'
import { listMyBoardsImperative } from '~/features/workspace/boards/data/cloud/boardRepository'
import { setupCloudImageFetcher } from './cloudImageFetcher'
import { pullAllCloudBoards } from './cloudPull'
import {
  decideFirstLoginMerge,
  markCloudPullCompleted,
  hasCompletedCloudPull,
  markCloudPullPending,
} from './cloudMerge'
import { getUserStableId } from '~/features/platform/auth/model/userIdentity'
import { persistBoardSyncState } from '~/features/workspace/boards/data/local/localBoardSession'
import { mapAsyncLimit } from '~/shared/lib/asyncMapLimit'
import { toast } from '~/shared/notifications/useToastStore'
import {
  createCloudSyncScheduler,
  type FlushResult,
  type PendingBoardSync,
} from './cloudSyncScheduler'
import { flushBoardToCloud, readBoardStateForCloudSync } from './cloudFlush'
import { useConflictQueueStore } from './useConflictQueueStore'
import { useSyncStatusStore } from './syncStatusStore'
import { setupConnectivity } from './connectivity'
import { resumePendingSyncs } from './pendingSyncRecovery'
import { pluralizeWord } from '~/shared/lib/pluralize'
import { CLOUD_SYNC_ENABLED } from './cloudSyncConfig'

const SYNC_DEBOUNCE_MS = 2500
const FIRST_LOGIN_BOARD_CONCURRENCY = 3

// push all local boards to the cloud (first-login, cloud-empty case)
const pushAllLocalBoards = async (
  userId: string,
  shouldProceed?: () => boolean
): Promise<{
  failedBoardIds: BoardId[]
  aborted: boolean
}> =>
{
  const boards = [...useWorkspaceBoardRegistryStore.getState().boards]

  const canProceed = (): boolean => (shouldProceed ? shouldProceed() : true)

  const results = await mapAsyncLimit(
    boards,
    FIRST_LOGIN_BOARD_CONCURRENCY,
    async (meta) =>
    {
      if (!canProceed())
      {
        return { boardId: meta.id, synced: false, aborted: true }
      }

      const { snapshot, syncState } = readBoardStateForCloudSync(meta.id)

      const boardExternalId = syncState.cloudBoardExternalId ?? meta.id
      const outcome = await flushBoardToCloud(
        snapshot,
        boardExternalId,
        syncState.lastSyncedRevision,
        userId
      )

      if (outcome.kind === 'synced')
      {
        if (!canProceed())
        {
          return { boardId: meta.id, synced: false, aborted: true }
        }

        persistBoardSyncState(meta.id, {
          lastSyncedRevision: outcome.revision,
          cloudBoardExternalId:
            syncState.cloudBoardExternalId ?? boardExternalId,
          pendingSyncAt: null,
        })
        return { boardId: meta.id, synced: true, aborted: false }
      }

      if (outcome.kind === 'error')
      {
        console.warn(`Board sync failed for ${meta.id}:`, outcome.error)
      }
      return { boardId: meta.id, synced: false, aborted: false }
    }
  )

  if (!canProceed() || results.some((result) => result.aborted))
  {
    return { failedBoardIds: [], aborted: true }
  }

  const failedBoardIds = results
    .filter((result) => !result.synced)
    .map((result) => result.boardId)

  if (failedBoardIds.length > 0)
  {
    toast(
      `${failedBoardIds.length} ${pluralizeWord(failedBoardIds.length, 'board')} failed to sync. They will be retried next sign-in.`,
      'error'
    )
  }

  return { failedBoardIds, aborted: false }
}

// run the first-login merge flow
const runFirstLoginMerge = async (
  user: Doc<'users'>,
  shouldProceed: () => boolean
): Promise<void> =>
{
  const userId = getUserStableId(user)
  if (hasCompletedCloudPull(userId) || !shouldProceed()) return

  try
  {
    const cloudBoards = await listMyBoardsImperative()
    if (!shouldProceed()) return

    const localBoards = useWorkspaceBoardRegistryStore.getState().boards
    const decision = decideFirstLoginMerge(cloudBoards, localBoards, userId)

    switch (decision.action)
    {
      case 'push-local':
      {
        const result = await pushAllLocalBoards(userId, shouldProceed)
        if (!result.aborted && result.failedBoardIds.length === 0)
        {
          markCloudPullCompleted(userId)
        }
        break
      }
      case 'pull-cloud':
      case 'resume-pull-cloud':
      {
        try
        {
          markCloudPullPending(userId)

          const result = await pullAllCloudBoards({
            cloudBoards,
            mode:
              decision.action === 'pull-cloud' ? 'replace' : 'merge-missing',
            shouldProceed,
          })
          if (result.kind === 'aborted' || !shouldProceed())
          {
            return
          }

          if (result.failedCount > 0 && result.pulledCount === 0)
          {
            toast('Failed to load cloud boards. Please try again.', 'error')
          }
          else
          {
            if (result.failedCount === 0)
            {
              markCloudPullCompleted(userId)
            }

            if (result.attemptedCount === 0)
            {
              break
            }

            toast(
              result.failedCount > 0
                ? `Loaded ${result.pulledCount} of ${result.attemptedCount} ${pluralizeWord(result.attemptedCount, 'board')}. Missing boards will be retried next sign-in.`
                : `Loaded ${result.pulledCount} ${pluralizeWord(result.pulledCount, 'board')} from the cloud.`,
              result.failedCount > 0 ? 'info' : 'success'
            )
          }
        }
        catch (error)
        {
          console.warn('Cloud pull failed:', error)
          if (shouldProceed())
          {
            toast('Failed to load cloud boards. Please try again.', 'error')
          }
        }
        break
      }
      case 'conflict':
        toast(
          'You have boards on both this device and the cloud. Merge support coming soon.',
          'info'
        )
        markCloudPullCompleted(userId)
        break
      case 'skip':
        markCloudPullCompleted(userId)
        break
    }
  }
  catch (error)
  {
    console.warn('First-login merge failed:', error)
  }
}

export const useCloudSync = (user: Doc<'users'> | null): void =>
{
  const userId = user ? getUserStableId(user) : null
  const authEpochRef = useRef(0)
  const currentUserIdRef = useRef<string | null>(null)
  const firstLoginMergeRef = useRef(false)

  useEffect(() =>
  {
    if (!userId || !user || !CLOUD_SYNC_ENABLED)
    {
      currentUserIdRef.current = null
      return
    }

    authEpochRef.current++
    const authEpoch = authEpochRef.current
    currentUserIdRef.current = userId
    // fresh sign-in starts w/ no carry-over conflicts or stale per-board
    // statuses. clears defensively in case sign-out raced w/ in-flight
    // resolution (the cleanup also clears both stores)
    useConflictQueueStore.getState().clear()
    useSyncStatusStore.getState().clear()

    const capturedUserId = userId
    let lastLoadedBoardId =
      useWorkspaceBoardRegistryStore.getState().activeBoardId

    const shouldProceed = (): boolean =>
      authEpochRef.current === authEpoch &&
      currentUserIdRef.current === capturedUserId

    const scheduler = createCloudSyncScheduler({
      debounceMs: SYNC_DEBOUNCE_MS,
      hasBoard: (boardId) =>
        useWorkspaceBoardRegistryStore
          .getState()
          .boards.some((board) => board.id === boardId),
      shouldProceed,
      flush: async (work): Promise<FlushResult> =>
      {
        if (!shouldProceed())
        {
          return {
            kind: 'error',
            error: new Error('auth changed mid-flush'),
          }
        }

        // short-circuit when offline — the connectivity module has flipped
        // the global online flag, the indicator already reads 'offline',
        // & a network call here would just throw. backoff still applies
        // (each offline edit drives one synthetic retry up to the backoff
        // cap) which is fine; resumePendingSyncs() resets backoff on
        // online -> we get a fresh fast retry as soon as connectivity
        // returns
        if (!useSyncStatusStore.getState().online)
        {
          return { kind: 'error', error: new Error('offline') }
        }

        const boardExternalId =
          work.syncState.cloudBoardExternalId ?? work.boardId
        const outcome = await flushBoardToCloud(
          work.snapshot,
          boardExternalId,
          work.syncState.lastSyncedRevision,
          capturedUserId
        )

        if (outcome.kind === 'conflict')
        {
          return { kind: 'conflict', serverState: outcome.serverState }
        }
        if (outcome.kind === 'error')
        {
          return { kind: 'error', error: outcome.error }
        }

        return {
          kind: 'synced',
          syncState: {
            lastSyncedRevision: outcome.revision,
            cloudBoardExternalId:
              work.syncState.cloudBoardExternalId ?? boardExternalId,
            pendingSyncAt: null,
          },
        }
      },
      persist: persistBoardSyncState,
      onError: (boardId, error) =>
      {
        // suppress the warn for synthetic offline errors — they're expected
        // & not worth surfacing in console for every offline edit
        const message = error instanceof Error ? error.message : String(error)
        if (message === 'offline') return
        console.warn(`Board sync failed for ${boardId}:`, error)
      },
      onConflict: (boardId, serverState) =>
      {
        useConflictQueueStore.getState().enqueue(boardId, serverState)
      },
      onStatusChange: (boardId, status) =>
      {
        useSyncStatusStore.getState().setBoardStatus(boardId, status)
      },
    })

    // wire up the cloud image fetcher (idempotent)
    setupCloudImageFetcher()

    // window online/offline listeners — flip the global online flag in the
    // status store & re-queue any boards w/ a pendingSyncAt marker on
    // offline -> online
    const disposeConnectivity = setupConnectivity({
      onOnline: () =>
      {
        if (!shouldProceed()) return
        resumePendingSyncs({
          queueWork: (work) => scheduler.queue(work),
          shouldProceed,
        })
      },
    })

    firstLoginMergeRef.current = true
    void runFirstLoginMerge(user, shouldProceed).finally(() =>
    {
      if (authEpochRef.current !== authEpoch)
      {
        return
      }
      firstLoginMergeRef.current = false

      // after the merge resolves, sweep persisted BoardSyncState for any
      // boards w/ unflushed local edits (pendingSyncAt set) & queue them.
      // covers the page-died-before-flush case from a prior session &
      // the kept-tab-open-but-tab-died case
      resumePendingSyncs({
        queueWork: (work) => scheduler.queue(work),
        shouldProceed,
      })
    })

    // subscribe only to persisted data fields via a shallow selector
    const unsubscribe = useActiveBoardStore.subscribe(
      selectBoardDataFields,
      () =>
      {
        if (!shouldProceed() || firstLoginMergeRef.current) return

        const boardId = useWorkspaceBoardRegistryStore.getState().activeBoardId
        if (!boardId)
        {
          return
        }

        // board loads/switches replace the active store wholesale. skip the
        // first change for a newly loaded board & only sync later user edits
        if (boardId !== lastLoadedBoardId)
        {
          lastLoadedBoardId = boardId
          return
        }

        const state = useActiveBoardStore.getState()
        const work: PendingBoardSync = {
          boardId,
          snapshot: extractBoardData(state),
          boardDataSelection: selectBoardDataFields(state),
          syncState: extractBoardSyncState(state),
        }
        scheduler.queue(work)
      },
      { equalityFn: boardDataFieldsEqual }
    )

    return () =>
    {
      void scheduler.dispose()
      unsubscribe()
      disposeConnectivity()
      firstLoginMergeRef.current = false
      // sign-out / user switch — drop pending conflicts & per-board sync
      // statuses for the previous user so a different sign-in doesn't
      // surface stale modal entries or stale indicator chrome
      useConflictQueueStore.getState().clear()
      useSyncStatusStore.getState().clear()
    }
  }, [userId, user])
}
