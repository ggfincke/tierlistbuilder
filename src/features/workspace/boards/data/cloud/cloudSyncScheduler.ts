// src/features/workspace/boards/data/cloud/cloudSyncScheduler.ts
// per-board cloud sync adapter over the shared debounce/retry runner

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type { CloudBoardState } from '@tierlistbuilder/contracts/workspace/cloudBoard'
import {
  boardDataFieldsEqual,
  type BoardDataSelection,
} from '~/features/workspace/boards/model/boardSnapshot'
import type { BoardSyncState } from '~/features/workspace/boards/model/sync'
import {
  announceBoardLock,
  getPeerLockRemainingMs,
  isBoardLockedByPeer,
} from '~/features/platform/sync/lib/crossTabSyncLock'
import type { SyncError } from '~/features/platform/sync/lib/errors'
import {
  createDebouncedSyncRunner,
  type BeforeSyncFlushDecision,
  type SyncRunnerErrorContext,
} from '~/shared/lib/sync/debouncedSyncRunner'

export interface PendingBoardSync
{
  boardId: BoardId
  snapshot: BoardSnapshot
  boardDataSelection: BoardDataSelection
  syncState: BoardSyncState
}

interface BoardSyncConflict
{
  cloudBoardExternalId: string
  serverState: CloudBoardState
}

// flush result kinds keep conflict retries distinct from real success
export type FlushResult =
  | { kind: 'synced'; syncState: BoardSyncState }
  | ({ kind: 'conflict' } & BoardSyncConflict)
  | { kind: 'error'; error: SyncError }

// statuses the scheduler emits via onStatusChange. 'conflict' & 'offline'
// are derived elsewhere, so this adapter stays focused on flush state
export type SchedulerBoardStatus = 'syncing' | 'idle' | 'error'

interface CreateCloudSyncSchedulerOptions
{
  debounceMs: number
  hasBoard: (boardId: BoardId) => boolean
  flush: (work: PendingBoardSync) => Promise<FlushResult>
  persistPendingWork: (work: PendingBoardSync) => boolean
  persistSyncState: (boardId: BoardId, syncState: BoardSyncState) => void
  persistSyncStateToStorage: (
    boardId: BoardId,
    syncState: BoardSyncState
  ) => void
  onError?: (boardId: BoardId, error: SyncError | unknown) => void
  onConflict?: (
    boardId: BoardId,
    cloudBoardExternalId: string,
    serverState: CloudBoardState
  ) => void
  onStatusChange?: (boardId: BoardId, status: SchedulerBoardStatus) => void
  shouldProceed?: () => boolean
}

export interface SchedulerDisposeOptions
{
  flush?: boolean
}

export interface CloudSyncScheduler
{
  queue: (work: PendingBoardSync) => void
  dispose: (options?: SchedulerDisposeOptions) => Promise<void>
}

const isPermanentSyncError = (error: unknown): error is SyncError =>
  typeof error === 'object' &&
  error !== null &&
  'permanent' in error &&
  (error as { permanent?: unknown }).permanent === true

export const createCloudSyncScheduler = (
  options: CreateCloudSyncSchedulerOptions
): CloudSyncScheduler =>
{
  const ensurePendingSyncMarker = (
    work: PendingBoardSync
  ): PendingBoardSync =>
  {
    if (work.syncState.pendingSyncAt !== null)
    {
      return work
    }

    const dirtiedWork: PendingBoardSync = {
      ...work,
      syncState: {
        ...work.syncState,
        pendingSyncAt: Date.now(),
      },
    }
    options.persistPendingWork(dirtiedWork)
    return dirtiedWork
  }

  const clearPendingSyncMarker = (work: PendingBoardSync): PendingBoardSync =>
  {
    if (work.syncState.pendingSyncAt === null)
    {
      return work
    }

    const cleanSyncState: BoardSyncState = {
      ...work.syncState,
      pendingSyncAt: null,
    }
    options.persistSyncState(work.boardId, cleanSyncState)
    return { ...work, syncState: cleanSyncState }
  }

  const beforeFlush = (
    work: PendingBoardSync,
    boardId: BoardId
  ): BeforeSyncFlushDecision<PendingBoardSync> =>
  {
    if (!options.hasBoard(boardId))
    {
      return { kind: 'drop' }
    }

    if (isBoardLockedByPeer(boardId))
    {
      const remaining = getPeerLockRemainingMs(boardId)
      const delayMs = Math.max(options.debounceMs, remaining + 50)
      return { kind: 'defer', delayMs, work }
    }

    announceBoardLock(boardId)
    return { kind: 'proceed' }
  }

  const rebaseQueuedOnSuccess = (
    queuedWork: PendingBoardSync,
    syncState: BoardSyncState,
    flushedWork: PendingBoardSync
  ): PendingBoardSync =>
  {
    const nextQueuedWork: PendingBoardSync = {
      ...queuedWork,
      syncState: {
        ...syncState,
        pendingSyncAt: queuedWork.syncState.pendingSyncAt,
      },
    }

    if (!options.persistPendingWork(nextQueuedWork))
    {
      options.persistSyncStateToStorage(flushedWork.boardId, syncState)
    }

    return nextQueuedWork
  }

  const handleError = (
    error: unknown,
    boardId: BoardId,
    work: PendingBoardSync,
    context: SyncRunnerErrorContext<PendingBoardSync>
  ): void =>
  {
    if (isPermanentSyncError(error))
    {
      clearPendingSyncMarker(context.queuedWork ?? work)
    }

    options.onError?.(boardId, error)
    options.onStatusChange?.(
      boardId,
      isPermanentSyncError(error) ? 'idle' : 'error'
    )
  }

  const runner = createDebouncedSyncRunner<
    BoardId,
    PendingBoardSync,
    BoardSyncState,
    BoardSyncConflict
  >({
    debounceMs: options.debounceMs,
    shouldProceed: options.shouldProceed,
    prepareWork: ensurePendingSyncMarker,
    beforeFlush,
    dedupEqual: (a, b) =>
      boardDataFieldsEqual(a.boardDataSelection, b.boardDataSelection),
    retainLastFlushed: true,
    flushQueuedAfterSuccess: 'immediate',
    dropQueuedOnUnretryableError: true,
    flush: async (work) =>
    {
      const result = await options.flush(work)
      if (result.kind === 'synced')
      {
        return { kind: 'synced', success: result.syncState }
      }
      if (result.kind === 'conflict')
      {
        return {
          kind: 'conflict',
          conflict: {
            cloudBoardExternalId: result.cloudBoardExternalId,
            serverState: result.serverState,
          },
        }
      }
      return { kind: 'error', error: result.error }
    },
    onQueue: (work) =>
    {
      options.onStatusChange?.(work.boardId, 'syncing')
    },
    onFlushStart: (work) =>
    {
      options.onStatusChange?.(work.boardId, 'syncing')
    },
    onSuccess: (syncState, work, _boardId, { queuedWork }) =>
    {
      if (!queuedWork)
      {
        options.persistSyncState(work.boardId, syncState)
      }
      options.onStatusChange?.(work.boardId, 'idle')
    },
    rebaseQueuedOnSuccess,
    onDedup: (work) =>
    {
      clearPendingSyncMarker(work)
      options.onStatusChange?.(work.boardId, 'idle')
    },
    onConflict: (conflict, work) =>
    {
      options.onConflict?.(
        work.boardId,
        conflict.cloudBoardExternalId,
        conflict.serverState
      )
      options.onStatusChange?.(work.boardId, 'idle')
    },
    onError: handleError,
    shouldRetryError: (error) => !isPermanentSyncError(error),
    onDrop: (work) =>
    {
      options.onStatusChange?.(work.boardId, 'idle')
    },
  })

  return {
    queue: (work) => runner.enqueue(work.boardId, work),
    dispose: (disposeOptions) => runner.dispose(disposeOptions),
  }
}
