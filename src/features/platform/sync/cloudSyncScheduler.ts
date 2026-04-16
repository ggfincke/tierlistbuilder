// src/features/platform/sync/cloudSyncScheduler.ts
// per-board cloud sync scheduler — debounce, in-flight serialization, & board-owned persistence

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import {
  boardDataFieldsEqual,
  type BoardDataSelection,
} from '~/features/workspace/boards/model/boardSnapshot'
import type { BoardSyncState } from '~/features/workspace/boards/model/sync'
import { announceBoardLock, isBoardLockedByPeer } from './crossTabSyncLock'

export interface PendingBoardSync
{
  boardId: BoardId
  snapshot: BoardSnapshot
  boardDataSelection: BoardDataSelection
  syncState: BoardSyncState
}

// tri-state result returned by the flush callback. callers use this to tell
// "don't advance lastSyncedRevision" (conflict) apart from "retry later"
// (error) — the previous null-as-both-conflict-& -error shape silently
// persisted the pre-conflict revision as if the push had succeeded
export type FlushResult =
  | { kind: 'synced'; syncState: BoardSyncState }
  | { kind: 'conflict' }
  | { kind: 'error'; error: unknown }

interface BoardSyncController
{
  timer: ReturnType<typeof setTimeout> | null
  queued: PendingBoardSync | null
  inFlight: PendingBoardSync | null
  // snapshot-selection the scheduler last successfully uploaded. used to
  // short-circuit queued work when the board data hasn't changed from the
  // last-uploaded state (avoids redundant round trips on identical edits)
  lastUploadedSelection: BoardDataSelection | null
}

interface CreateCloudSyncSchedulerOptions
{
  debounceMs: number
  hasBoard: (boardId: BoardId) => boolean
  flush: (work: PendingBoardSync) => Promise<FlushResult>
  persist: (boardId: BoardId, syncState: BoardSyncState) => void
  onError?: (boardId: BoardId, error: unknown) => void
  onConflict?: (boardId: BoardId) => void
  // optional auth/epoch gate — returning false short-circuits flushes so
  // a mid-flush sign-out doesn't persist state for the previous user
  shouldProceed?: () => boolean
}

export interface SchedulerDisposeOptions
{
  // drain queued work synchronously before tearing down. used on unload to
  // flush pending edits before the tab goes away. ignored in tests
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

  const scheduleBoardSyncFlush = (
    boardId: BoardId,
    controller: BoardSyncController
  ): void =>
  {
    clearBoardSyncTimer(controller)
    controller.timer = setTimeout(() =>
    {
      controller.timer = null
      flushQueuedBoardSync(boardId)
    }, options.debounceMs)
  }

  const runFlush = (
    boardId: BoardId,
    controller: BoardSyncController,
    work: PendingBoardSync
  ): Promise<void> =>
  {
    controller.inFlight = work
    let nextSyncState: BoardSyncState | null = null
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
            options.persist(work.boardId, result.syncState)
            return
          }

          if (result.kind === 'conflict')
          {
            // deliberately do NOT advance lastSyncedRevision; the next push
            // w/ the same baseRevision must surface the conflict again
            syncConflicted = true
            options.onConflict?.(work.boardId)
            return
          }

          syncErrored = true
          options.onError?.(work.boardId, result.error)
        },
        (error) =>
        {
          if (disposed) return
          // options.flush is expected to return FlushResult (never throw),
          // but treat a throw as a transient error to keep retries working
          syncErrored = true
          options.onError?.(work.boardId, error)
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

        if (nextSyncState && controller.queued)
        {
          controller.queued = {
            ...controller.queued,
            syncState: nextSyncState,
          }
          flushQueuedBoardSync(boardId)
          return
        }

        if (syncErrored && controller.queued)
        {
          scheduleBoardSyncFlush(boardId, controller)
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
      pruneBoardSyncController(controllers, boardId, controller)
      return
    }

    if (!options.hasBoard(boardId))
    {
      pruneBoardSyncController(controllers, boardId, controller)
      return
    }

    if (isBoardLockedByPeer(boardId))
    {
      // another tab is pushing this board right now; re-queue for the
      // end of the TTL window rather than racing w/ that tab. on the
      // retry, isBoardLockedByPeer will have cleared (or the peer died
      // & the TTL expired, whichever comes first)
      scheduleBoardSyncFlush(boardId, controller)
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

      const controller = getOrCreateBoardSyncController(
        controllers,
        work.boardId
      )
      controller.queued = work
      scheduleBoardSyncFlush(work.boardId, controller)
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
