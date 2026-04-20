// src/features/platform/sync/boards/cloudSyncScheduler.ts
// per-board cloud sync scheduler — debounce, in-flight serialization, board-owned
// persistence, exponential retry backoff, & status callbacks for the indicator chrome

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type { CloudBoardState } from '@tierlistbuilder/contracts/workspace/cloudBoard'
import {
  boardDataFieldsEqual,
  type BoardDataSelection,
} from '~/features/workspace/boards/model/boardSnapshot'
import type { BoardSyncState } from '~/features/workspace/boards/model/sync'
import { computeBackoffDelay } from '~/shared/lib/sync/backoff'
import {
  announceBoardLock,
  getPeerLockRemainingMs,
  isBoardLockedByPeer,
} from '../lib/crossTabSyncLock'
import type { SyncError } from '../lib/errors'

export interface PendingBoardSync
{
  boardId: BoardId
  snapshot: BoardSnapshot
  boardDataSelection: BoardDataSelection
  syncState: BoardSyncState
}

// flush result kinds keep conflict retries distinct from real success
export type FlushResult =
  | { kind: 'synced'; syncState: BoardSyncState }
  | { kind: 'conflict'; serverState: CloudBoardState }
  | { kind: 'error'; error: SyncError }

// statuses the scheduler emits via onStatusChange. 'conflict' & 'offline'
// are derived elsewhere (conflict from useConflictQueueStore, offline from
// the connectivity module) so the scheduler stays focused on flush state
export type SchedulerBoardStatus = 'syncing' | 'idle' | 'error'

interface BoardSyncController
{
  timer: ReturnType<typeof setTimeout> | null
  queued: PendingBoardSync | null
  inFlight: PendingBoardSync | null
  lastUploadedSelection: BoardDataSelection | null
  retryAttempt: number
}

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
  onConflict?: (boardId: BoardId, serverState: CloudBoardState) => void
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

const clearBoardSyncTimer = (controller: BoardSyncController): void =>
{
  if (!controller.timer)
  {
    return
  }

  clearTimeout(controller.timer)
  controller.timer = null
}

const getOrCreateBoardSyncController = (
  controllers: Map<BoardId, BoardSyncController>,
  boardId: BoardId
): BoardSyncController =>
{
  const existing = controllers.get(boardId)
  if (existing)
  {
    return existing
  }

  const created: BoardSyncController = {
    timer: null,
    queued: null,
    inFlight: null,
    lastUploadedSelection: null,
    retryAttempt: 0,
  }
  controllers.set(boardId, created)
  return created
}

const pruneBoardSyncController = (
  controllers: Map<BoardId, BoardSyncController>,
  boardId: BoardId,
  controller: BoardSyncController
): void =>
{
  if (
    controller.timer ||
    controller.queued ||
    controller.inFlight ||
    controller.lastUploadedSelection
  )
  {
    return
  }

  controllers.delete(boardId)
}

export const createCloudSyncScheduler = (
  options: CreateCloudSyncSchedulerOptions
): CloudSyncScheduler =>
{
  const controllers = new Map<BoardId, BoardSyncController>()
  let disposed = false
  // tracks in-flight flush promises so dispose({ flush: true }) can await them
  const inFlightPromises = new Set<Promise<void>>()

  // stamp pendingSyncAt on a fresh edit (transition from null) & try to
  // persist the snapshot + sync state together so restart recovery only sees
  // markers backed by a durable snapshot
  const ensurePendingSyncMarker = (
    work: PendingBoardSync
  ): PendingBoardSync =>
  {
    if (work.syncState.pendingSyncAt !== null)
    {
      return work
    }

    const dirtiedSyncState: BoardSyncState = {
      ...work.syncState,
      pendingSyncAt: Date.now(),
    }
    const dirtiedWork = { ...work, syncState: dirtiedSyncState }
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

  const scheduleBoardSyncFlush = (
    boardId: BoardId,
    controller: BoardSyncController,
    delayMs: number = options.debounceMs
  ): void =>
  {
    clearBoardSyncTimer(controller)
    controller.timer = setTimeout(() =>
    {
      controller.timer = null
      flushQueuedBoardSync(boardId)
    }, delayMs)
  }

  const runFlush = (
    boardId: BoardId,
    controller: BoardSyncController,
    work: PendingBoardSync
  ): Promise<void> =>
  {
    controller.inFlight = work
    options.onStatusChange?.(boardId, 'syncing')
    let nextSyncState: BoardSyncState | null = null
    let nextQueuedWork: PendingBoardSync | null = null
    let syncErrored = false
    let syncConflicted = false

    const promise = options
      .flush(work)
      .then(
        (result) =>
        {
          if (disposed) return

          if (result.kind === 'synced')
          {
            nextSyncState = result.syncState
            controller.lastUploadedSelection = work.boardDataSelection
            controller.retryAttempt = 0

            if (controller.queued)
            {
              nextQueuedWork = {
                ...controller.queued,
                syncState: {
                  ...result.syncState,
                  pendingSyncAt: controller.queued.syncState.pendingSyncAt,
                },
              }

              if (!options.persistPendingWork(nextQueuedWork))
              {
                options.persistSyncStateToStorage(
                  work.boardId,
                  result.syncState
                )
              }
            }
            else
            {
              options.persistSyncState(work.boardId, result.syncState)
            }

            options.onStatusChange?.(work.boardId, 'idle')
            return
          }

          if (result.kind === 'conflict')
          {
            // do NOT advance lastSyncedRevision; same baseRevision must surface
            // the conflict again. emit 'idle' — conflict queue carries the signal
            syncConflicted = true
            options.onConflict?.(work.boardId, result.serverState)
            options.onStatusChange?.(work.boardId, 'idle')
            return
          }

          syncErrored = true
          // permanent errors (forbidden, notFound, invalidState…) will never
          // succeed on retry; clear the persisted marker & drop the queue so
          // reconnect/session recovery does not requeue the same doomed work
          if (result.error.permanent)
          {
            clearPendingSyncMarker(controller.queued ?? work)
            controller.queued = null
            controller.retryAttempt = 0
            syncErrored = false
          }
          options.onError?.(work.boardId, result.error)
          options.onStatusChange?.(
            work.boardId,
            result.error.permanent ? 'idle' : 'error'
          )
        },
        (error) =>
        {
          if (disposed) return
          // options.flush is expected to return FlushResult (never throw),
          // but treat a throw as a transient error to keep retries working
          syncErrored = true
          options.onError?.(work.boardId, error)
          options.onStatusChange?.(work.boardId, 'error')
        }
      )
      .finally(() =>
      {
        // always release the controller so new edits can queue even after
        // a dispose-during-flush; skip onSuccess/retry side-effects below
        // when disposed
        controller.inFlight = null

        if (disposed)
        {
          return
        }

        if (nextQueuedWork)
        {
          controller.queued = nextQueuedWork
          flushQueuedBoardSync(boardId)
          return
        }

        if (syncErrored)
        {
          if (!controller.queued)
          {
            controller.queued = work
          }

          // error retry uses exponential backoff. compute the delay first,
          // then bump the counter so the NEXT retry waits longer
          const delay = computeBackoffDelay(
            options.debounceMs,
            controller.retryAttempt
          )
          controller.retryAttempt++
          scheduleBoardSyncFlush(boardId, controller, delay)
          return
        }

        if (syncConflicted)
        {
          // leave queued work in place; the next edit (or the next queue()
          // w/ the same work) will retry once the user resolves.
          // do not schedule automatically — we'd spin on the same conflict
          pruneBoardSyncController(controllers, boardId, controller)
          return
        }

        if (!nextSyncState)
        {
          controller.queued = null
        }

        pruneBoardSyncController(controllers, boardId, controller)
      })

    inFlightPromises.add(promise)
    void promise.finally(() => inFlightPromises.delete(promise))
    return promise
  }

  const flushQueuedBoardSync = (boardId: BoardId): void =>
  {
    if (disposed)
    {
      return
    }

    if (options.shouldProceed && !options.shouldProceed())
    {
      // auth changed mid-wait; drop queued work for this board so we don't
      // upload the previous user's edits after a sign-out/switch
      const controller = controllers.get(boardId)
      if (controller)
      {
        controller.queued = null
        clearBoardSyncTimer(controller)
        pruneBoardSyncController(controllers, boardId, controller)
      }
      return
    }

    const controller = controllers.get(boardId)
    if (!controller || controller.inFlight)
    {
      return
    }

    const work = controller.queued
    if (!work)
    {
      pruneBoardSyncController(controllers, boardId, controller)
      return
    }

    controller.queued = null

    if (
      controller.lastUploadedSelection &&
      boardDataFieldsEqual(
        controller.lastUploadedSelection,
        work.boardDataSelection
      )
    )
    {
      clearPendingSyncMarker(work)
      controller.retryAttempt = 0

      // same bytes as the last successful upload — skip the round trip but
      // still flip status back to idle since whatever the user did landed
      // on identical state
      options.onStatusChange?.(boardId, 'idle')
      pruneBoardSyncController(controllers, boardId, controller)
      return
    }

    if (!options.hasBoard(boardId))
    {
      // board deleted while queued; emit idle to reset any lingering chrome
      // & drop the controller
      options.onStatusChange?.(boardId, 'idle')
      pruneBoardSyncController(controllers, boardId, controller)
      return
    }

    if (isBoardLockedByPeer(boardId))
    {
      // another tab is pushing; wait out the lock TTL instead of spinning
      // the debounce — a peer editing every debounceMs keeps refreshing its
      // lock & would otherwise loop us forever. retry once the lock expires
      controller.queued = work
      const remaining = getPeerLockRemainingMs(boardId)
      // small buffer avoids racing the exact boundary; clamp below to
      // debounceMs so a near-expired lock still honors the debounce floor
      const retryDelay = Math.max(options.debounceMs, remaining + 50)
      scheduleBoardSyncFlush(boardId, controller, retryDelay)
      return
    }

    announceBoardLock(boardId)
    void runFlush(boardId, controller, work)
  }

  return {
    queue: (work) =>
    {
      if (disposed)
      {
        return
      }

      // stamp the dirty marker BEFORE anything else so a tab killed during
      // the debounce window still leaves a trail for next-session recovery
      const dirtiedWork = ensurePendingSyncMarker(work)

      const controller = getOrCreateBoardSyncController(
        controllers,
        dirtiedWork.boardId
      )
      controller.queued = dirtiedWork
      // fresh edit cancels any pending backoff retry so the UX feels responsive;
      // next failure restarts the backoff progression from 0
      controller.retryAttempt = 0
      scheduleBoardSyncFlush(dirtiedWork.boardId, controller)

      // emit 'syncing' immediately so the indicator flips on edit, not
      // 2.5s later when the timer fires
      options.onStatusChange?.(dirtiedWork.boardId, 'syncing')
    },

    dispose: async ({ flush = false }: SchedulerDisposeOptions = {}) =>
    {
      if (flush)
      {
        // drain any queued work synchronously: collapse debounce timers
        // into immediate flushes, then wait for everything in flight
        for (const [boardId, controller] of controllers)
        {
          clearBoardSyncTimer(controller)
          if (!controller.inFlight && controller.queued)
          {
            flushQueuedBoardSync(boardId)
          }
        }
        await Promise.allSettled([...inFlightPromises])
      }

      disposed = true

      for (const controller of controllers.values())
      {
        clearBoardSyncTimer(controller)
      }

      controllers.clear()
    },
  }
}
