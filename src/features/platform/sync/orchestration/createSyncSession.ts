// src/features/platform/sync/orchestration/createSyncSession.ts
// per-user sync session: scheduler, connectivity, board-delete, first-login lifecycle, image fetcher

import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { markBoardSynced } from '~/features/workspace/boards/model/sync'
import { setupCloudImageFetcher } from '~/features/platform/media/imageFetcher'
import { runFirstLoginSyncLifecycle } from './firstLoginSyncLifecycle'
import { setupBoardDeleteCloudSync } from '~/features/workspace/boards/data/cloud/setupBoardDeleteCloudSync'
import { runFirstLoginBoardMerge } from '~/features/workspace/boards/data/cloud/firstLoginBoardMerge'
import { mergeSettingsOnFirstLogin } from '~/features/workspace/settings/data/cloud/cloudMerge'
import { mergeTierPresetsOnFirstLogin } from '~/features/workspace/tier-presets/data/cloud/cloudMerge'
import {
  persistBoardStateForSync,
  persistBoardSyncState,
  persistBoardSyncStateToStorageOnly,
  setBoardDeletedListener,
} from '~/features/workspace/boards/data/local/localBoardSession'
import {
  classifySyncError,
  isOfflineError,
  makeOfflineError,
} from '~/features/platform/sync/lib/errors'
import {
  createCloudSyncScheduler,
  type CloudSyncScheduler,
  type FlushResult,
} from '~/features/workspace/boards/data/cloud/cloudSyncScheduler'
import { flushBoardToCloud } from '~/features/workspace/boards/data/cloud/cloudFlush'
import { useConflictQueueStore } from '~/features/workspace/boards/data/cloud/conflicts/useConflictQueueStore'
import { useSyncStatusStore } from '~/features/platform/sync/state/syncStatusStore'
import { logger } from '~/shared/lib/logger'
import { setupConnectivity } from '~/features/platform/sync/transport/connectivity'
import {
  buildSettingsTriggerSnapshot,
  resumePendingSyncs,
} from './pendingSyncRecovery'
import type { HandleRegistry } from './useHandleRegistry'
import { CLOUD_SYNC_DEBOUNCE_MS } from '~/features/platform/sync/lib/concurrency'

export interface SyncSession
{
  scheduler: CloudSyncScheduler
  triggerResume: () => void
  // getter — stays live for subscribers that want the current merge-gate state
  isMergePending: () => boolean
  dispose: () => void
}

export interface CreateSyncSessionOptions
{
  userId: string
  shouldProceed: () => boolean
  handles: HandleRegistry
}

// wires the scheduler, connectivity, board-delete sync, first-login lifecycle
// & cloud image fetcher for a single active user. dispose() unwinds in the
// order the original god-effect cleanup ran
export const createSyncSession = ({
  userId,
  shouldProceed,
  handles,
}: CreateSyncSessionOptions): SyncSession =>
{
  // merge-pending gate; flipped true before lifecycle kicks off, false when
  // the board-merge settles. subscriber reads via isMergePending()
  let mergePending = false

  const scheduler = createCloudSyncScheduler({
    debounceMs: CLOUD_SYNC_DEBOUNCE_MS,
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
        userId
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
      logger.warn('sync', `Board sync failed for ${boardId}:`, error)
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
      userId,
      queueBoard: (work) => scheduler.queue(work),
      triggerSettings: handles.settingsRef.current
        ? () =>
            handles.settingsRef.current?.runner.trigger(
              buildSettingsTriggerSnapshot(),
              { immediate: true }
            )
        : undefined,
      enqueuePreset: handles.presetsRef.current
        ? (work) =>
            handles.presetsRef.current?.runner.enqueue(work, {
              immediate: true,
            })
        : undefined,
      triggerBoardDelete: handles.boardDeleteRef.current
        ? () => handles.boardDeleteRef.current?.triggerDrain()
        : undefined,
      shouldProceed,
    })
  }

  // board-delete sync installs immediately — no first-login merge gate needed
  // since deletes don't conflict w/ pulls (pull only walks active boards).
  // early install means deletes during the merge window get a drain trigger
  handles.boardDeleteRef.current = setupBoardDeleteCloudSync({
    shouldProceed,
    onError: (cloudExternalId, error) =>
    {
      if (isOfflineError(error)) return
      logger.warn(
        'sync',
        `Board delete cloud sync failed for ${cloudExternalId}:`,
        error
      )
    },
  })
  setBoardDeletedListener(() => handles.boardDeleteRef.current?.triggerDrain())

  // window online/offline listeners — flip the global online flag in the
  // status store & re-queue any pending work on offline -> online
  const disposeConnectivity = setupConnectivity({
    onOnline: () =>
    {
      triggerResume()
    },
  })

  mergePending = true
  void runFirstLoginSyncLifecycle({
    shouldProceed,
    runBoardMerge: () => runFirstLoginBoardMerge(userId, shouldProceed),
    runSettingsMerge: () =>
      mergeSettingsOnFirstLogin({ userId, shouldProceed }),
    runPresetMerge: () =>
      mergeTierPresetsOnFirstLogin({ userId, shouldProceed }),
    onBoardMergeSettled: () =>
    {
      mergePending = false
      triggerResume()
    },
    onSettingsMergeSettled: () =>
    {
      handles.installSettings({
        userId,
        shouldProceed,
        onInstalled: triggerResume,
      })
    },
    onPresetMergeSettled: () =>
    {
      handles.installPresets({
        userId,
        shouldProceed,
        onInstalled: triggerResume,
      })
    },
  })

  const dispose = (): void =>
  {
    void scheduler.dispose()
    disposeConnectivity()
    mergePending = false

    // detach the listener first so any in-flight delete doesn't dispatch
    // into a disposed handle. the sidecar survives for the next sign-in
    setBoardDeletedListener(null)
  }

  return {
    scheduler,
    triggerResume,
    isMergePending: () => mergePending,
    dispose,
  }
}
