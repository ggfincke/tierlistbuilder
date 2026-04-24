// src/features/workspace/sync/workspaceSyncSession.ts
// workspace sync session: board/settings/preset adapters, sidecars, & conflicts

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { markBoardSynced } from '~/features/workspace/boards/model/sync'
import { setupCloudImageFetcher } from '~/features/platform/media/imageFetcher'
import { runFirstLoginSyncLifecycle } from '~/features/platform/sync/orchestration/firstLoginSyncLifecycle'
import { setupBoardDeleteCloudSync } from '~/features/workspace/boards/data/cloud/setupBoardDeleteCloudSync'
import { runFirstLoginBoardMerge } from '~/features/workspace/boards/data/cloud/firstLoginBoardMerge'
import { mergeSettingsOnFirstLogin } from '~/features/workspace/settings/data/cloud/cloudMerge'
import { mergeTierPresetsOnFirstLogin } from '~/features/workspace/tier-presets/data/cloud/cloudMerge'
import {
  persistBoardStateForSync,
  persistBoardSyncState,
  persistBoardSyncStateToStorageOnly,
  setBoardDeletedListener,
} from '~/features/workspace/boards/model/boardSession'
import {
  classifySyncError,
  isOfflineError,
  makeOfflineError,
} from '~/features/platform/sync/lib/errors'
import {
  createCloudSyncScheduler,
  type CloudSyncScheduler,
  type FlushResult,
  type PendingBoardSync,
  type SchedulerBoardStatus,
} from '~/features/workspace/boards/data/cloud/cloudSyncScheduler'
import { flushBoardToCloud } from '~/features/workspace/boards/data/cloud/cloudFlush'
import { useConflictQueueStore } from '~/features/workspace/boards/model/boardConflictQueueStore'
import { logger } from '~/shared/lib/logger'
import { CLOUD_SYNC_DEBOUNCE_MS } from '~/features/platform/sync/lib/concurrency'
import {
  buildSettingsTriggerSnapshot,
  resumePendingSyncs,
} from './pendingSyncRecovery'
import { createWorkspaceSyncHandleRegistry } from './workspaceSyncHandles'

export interface WorkspaceSyncSession
{
  queueBoard: (work: PendingBoardSync) => void
  triggerResume: () => void
  isMergePending: () => boolean
  dispose: () => void
}

export interface CreateWorkspaceSyncSessionOptions
{
  userId: string
  isOnline: () => boolean
  shouldProceed: () => boolean
  setBoardStatus: (boardId: BoardId, status: SchedulerBoardStatus) => void
}

const hasBoard = (boardId: BoardId): boolean =>
  useWorkspaceBoardRegistryStore
    .getState()
    .boards.some((board) => board.id === boardId)

export const clearWorkspaceSyncState = (): void =>
{
  useConflictQueueStore.getState().clear()
}

export const createWorkspaceSyncSession = ({
  userId,
  isOnline,
  shouldProceed,
  setBoardStatus,
}: CreateWorkspaceSyncSessionOptions): WorkspaceSyncSession =>
{
  let mergePending = false
  const handles = createWorkspaceSyncHandleRegistry()

  const scheduler: CloudSyncScheduler = createCloudSyncScheduler({
    debounceMs: CLOUD_SYNC_DEBOUNCE_MS,
    hasBoard,
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

      if (!isOnline())
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
        return {
          kind: 'conflict',
          cloudBoardExternalId: boardExternalId,
          serverState: outcome.serverState,
        }
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
      if (isOfflineError(error)) return
      logger.warn('sync', `Board sync failed for ${boardId}:`, error)
    },
    onConflict: (boardId, cloudBoardExternalId, serverState) =>
    {
      useConflictQueueStore
        .getState()
        .enqueue(boardId, cloudBoardExternalId, serverState)
    },
    onStatusChange: setBoardStatus,
  })

  setupCloudImageFetcher()

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

  handles.boardDeleteRef.current = setupBoardDeleteCloudSync({
    isOnline,
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
        isOnline,
        shouldProceed,
        onInstalled: triggerResume,
      })
    },
    onPresetMergeSettled: () =>
    {
      handles.installPresets({
        userId,
        isOnline,
        shouldProceed,
        onInstalled: triggerResume,
      })
    },
  })

  const dispose = (): void =>
  {
    void scheduler.dispose()
    handles.disposeAll()
    mergePending = false
    setBoardDeletedListener(null)
  }

  return {
    queueBoard: (work) => scheduler.queue(work),
    triggerResume,
    isMergePending: () => mergePending,
    dispose,
  }
}
