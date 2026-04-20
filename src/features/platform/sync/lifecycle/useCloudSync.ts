// src/features/platform/sync/lifecycle/useCloudSync.ts
// top-level cloud sync subscriber — gated on signed-in status,
// debounces board, settings, & preset changes to Convex mutations

import { useEffect, useRef } from 'react'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { PublicUserMe } from '@tierlistbuilder/contracts/platform/user'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import {
  boardDataFieldsEqual,
  extractBoardData,
  selectBoardDataFields,
} from '~/features/workspace/boards/model/boardSnapshot'
import {
  extractBoardSyncState,
  markBoardSynced,
} from '~/features/workspace/boards/model/sync'
import { listMyBoardsImperative } from '~/features/workspace/boards/data/cloud/boardRepository'
import { setupCloudImageFetcher } from '~/features/platform/media/imageFetcher'
import { pullAllCloudBoards } from '../boards/cloudPull'
import { runFirstLoginSyncLifecycle } from './firstLoginSyncLifecycle'
import {
  setupBoardDeleteCloudSync,
  type BoardDeleteCloudSyncHandle,
} from '../board-deletes/setupBoardDeleteCloudSync'
import {
  decideFirstLoginMerge,
  markCloudPullCompleted,
  hasCompletedCloudPull,
  markCloudPullPending,
} from '../boards/cloudMerge'
import { mergeSettingsOnFirstLogin } from '../settings/cloudMerge'
import { mergeTierPresetsOnFirstLogin } from '../tier-presets/cloudMerge'
import { getUserStableId } from '~/features/platform/auth/model/userIdentity'
import {
  persistBoardStateForSync,
  persistBoardSyncState,
  persistBoardSyncStateToStorageOnly,
  setBoardDeletedListener,
} from '~/features/workspace/boards/data/local/localBoardSession'
import { mapAsyncLimit } from '~/shared/lib/asyncMapLimit'
import { makeProceedGuard } from '~/shared/lib/sync/proceedGuard'
import {
  classifySyncError,
  isOfflineError,
  makeOfflineError,
} from '~/features/platform/sync/lib/errors'
import { toast } from '~/shared/notifications/useToastStore'
import {
  createCloudSyncScheduler,
  type FlushResult,
  type PendingBoardSync,
} from '../boards/cloudSyncScheduler'
import {
  flushBoardToCloud,
  readBoardStateForCloudSync,
} from '../boards/cloudFlush'
import { useConflictQueueStore } from '../conflicts/useConflictQueueStore'
import { useSyncStatusStore } from '../status/syncStatusStore'
import { setupConnectivity } from '../lib/connectivity'
import {
  buildSettingsTriggerSnapshot,
  resumePendingSyncs,
} from './pendingSyncRecovery'
import {
  setupSettingsCloudSync,
  type SettingsCloudSyncHandle,
} from '../settings/cloudSync'
import {
  setupTierPresetCloudSync,
  type TierPresetCloudSyncHandle,
} from '../tier-presets/cloudSync'
import { pluralizeWord } from '~/shared/lib/pluralize'
import { CLOUD_SYNC_ENABLED } from '../lib/cloudSyncConfig'

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

  const canProceed = makeProceedGuard(shouldProceed)

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

        persistBoardSyncState(
          meta.id,
          markBoardSynced(outcome.revision, boardExternalId)
        )
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

// run the first-login merge flow for boards (settings & preset merges
// run separately after this resolves so the board path can keep its
// modal-driven UX without dragging cosmetic prefs into the same flow)
const runFirstLoginBoardMerge = async (
  userId: string,
  shouldProceed: () => boolean
): Promise<void> =>
{
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
          'Signed in. Your local and cloud boards are kept separately for now.',
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

export const useCloudSync = (user: PublicUserMe | null): void =>
{
  const userId = user ? getUserStableId(user) : null
  const authEpochRef = useRef(0)
  const currentUserIdRef = useRef<string | null>(null)
  const boardFirstLoginMergeRef = useRef(false)
  const settingsHandleRef = useRef<SettingsCloudSyncHandle | null>(null)
  const presetsHandleRef = useRef<TierPresetCloudSyncHandle | null>(null)
  const boardDeleteHandleRef = useRef<BoardDeleteCloudSyncHandle | null>(null)

  useEffect(() =>
  {
    if (!userId || !CLOUD_SYNC_ENABLED)
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
            error: classifySyncError(new Error('auth changed mid-flush')),
          }
        }

        // short-circuit when offline — indicator already reads 'offline' &
        // a network call here would throw. backoff applies but resets when
        // resumePendingSyncs() fires on the next online transition
        if (!useSyncStatusStore.getState().online)
        {
          return {
            kind: 'error',
            error: classifySyncError(makeOfflineError()),
          }
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
          syncState: markBoardSynced(outcome.revision, boardExternalId),
        }
      },
      persistSyncState: persistBoardSyncState,
      persistSyncStateToStorage: persistBoardSyncStateToStorageOnly,
      persistPendingWork: (work) =>
        persistBoardStateForSync(work.boardId, work.snapshot, work.syncState),
      onError: (boardId, error) =>
      {
        // suppress the warn for synthetic offline errors — they're expected
        // & not worth surfacing in console for every offline edit
        if (isOfflineError(error)) return
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

    // resume helper threads current handle refs through; settings/preset/
    // board-delete triggers are no-ops until their handles are installed
    const triggerResume = (): void =>
    {
      if (!shouldProceed()) return
      resumePendingSyncs({
        userId: capturedUserId,
        queueBoard: (work) => scheduler.queue(work),
        triggerSettings: settingsHandleRef.current
          ? () =>
              settingsHandleRef.current?.runner.trigger(
                buildSettingsTriggerSnapshot(),
                { immediate: true }
              )
          : undefined,
        enqueuePreset: presetsHandleRef.current
          ? (work) =>
              presetsHandleRef.current?.runner.enqueue(work, {
                immediate: true,
              })
          : undefined,
        triggerBoardDelete: boardDeleteHandleRef.current
          ? () => boardDeleteHandleRef.current?.triggerDrain()
          : undefined,
        shouldProceed,
      })
    }

    const installSettingsSync = (): void =>
    {
      if (!shouldProceed() || settingsHandleRef.current)
      {
        return
      }

      settingsHandleRef.current = setupSettingsCloudSync({
        debounceMs: SYNC_DEBOUNCE_MS,
        userId: capturedUserId,
        shouldProceed,
      })
      triggerResume()
    }

    const installPresetSync = (): void =>
    {
      if (!shouldProceed() || presetsHandleRef.current)
      {
        return
      }

      presetsHandleRef.current = setupTierPresetCloudSync({
        debounceMs: SYNC_DEBOUNCE_MS,
        userId: capturedUserId,
        shouldProceed,
      })
      triggerResume()
    }

    // board-delete sync installs immediately — no first-login merge gate needed
    // since deletes don't conflict w/ pulls (pull only walks active boards).
    // early install means deletes during the merge window get a drain trigger
    boardDeleteHandleRef.current = setupBoardDeleteCloudSync({
      shouldProceed,
      onError: (cloudExternalId, error) =>
      {
        if (isOfflineError(error)) return
        console.warn(
          `Board delete cloud sync failed for ${cloudExternalId}:`,
          error
        )
      },
    })
    setBoardDeletedListener(() => boardDeleteHandleRef.current?.triggerDrain())

    // window online/offline listeners — flip the global online flag in the
    // status store & re-queue any pending work on offline -> online
    const disposeConnectivity = setupConnectivity({
      onOnline: () =>
      {
        triggerResume()
      },
    })

    boardFirstLoginMergeRef.current = true
    void runFirstLoginSyncLifecycle({
      shouldProceed,
      runBoardMerge: () =>
        runFirstLoginBoardMerge(capturedUserId, shouldProceed),
      runSettingsMerge: () =>
        mergeSettingsOnFirstLogin({
          userId: capturedUserId,
          shouldProceed,
        }),
      runPresetMerge: () =>
        mergeTierPresetsOnFirstLogin({
          userId: capturedUserId,
          shouldProceed,
        }),
      onBoardMergeSettled: () =>
      {
        lastLoadedBoardId =
          useWorkspaceBoardRegistryStore.getState().activeBoardId
        boardFirstLoginMergeRef.current = false
        triggerResume()
      },
      onSettingsMergeSettled: () =>
      {
        installSettingsSync()
      },
      onPresetMergeSettled: () =>
      {
        installPresetSync()
      },
    })

    // subscribe only to persisted board data fields via a shallow selector
    const unsubscribe = useActiveBoardStore.subscribe(
      selectBoardDataFields,
      () =>
      {
        if (!shouldProceed() || boardFirstLoginMergeRef.current) return

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
      boardFirstLoginMergeRef.current = false

      // detach the listener first so any in-flight delete doesn't dispatch
      // into a disposed handle. the sidecar survives for the next sign-in
      setBoardDeletedListener(null)

      // dispose settings + preset + board-delete handles in parallel —
      // each awaits its in-flight flushes, & the three don't share state
      const handles = [
        settingsHandleRef.current,
        presetsHandleRef.current,
        boardDeleteHandleRef.current,
      ].filter(
        (handle): handle is NonNullable<typeof handle> => handle !== null
      )
      settingsHandleRef.current = null
      presetsHandleRef.current = null
      boardDeleteHandleRef.current = null
      if (handles.length > 0)
      {
        void Promise.allSettled(handles.map((handle) => handle.dispose()))
      }

      // sign-out / user switch — drop pending conflicts & per-board sync
      // statuses for the previous user so a different sign-in doesn't
      // surface stale modal entries or stale indicator chrome
      useConflictQueueStore.getState().clear()
      useSyncStatusStore.getState().clear()
    }
    // intentionally scoped to userId only — Convex re-renders the user
    // doc on every tier/image/auth-lib patch; re-running the effect would
    // tear down the entire sync stack & wipe the conflict queue every time
  }, [userId])
}
