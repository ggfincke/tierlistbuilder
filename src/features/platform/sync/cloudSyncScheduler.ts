// src/features/platform/sync/cloudSyncScheduler.ts
// per-board cloud sync scheduler — debounce, in-flight serialization, & board-owned persistence

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type { CloudBoardState } from '@tierlistbuilder/contracts/workspace/cloudBoard'
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

// flush result kinds keep conflict retries distinct from real success
export type FlushResult =
  | { kind: 'synced'; syncState: BoardSyncState }
  | { kind: 'conflict'; serverState: CloudBoardState }
  | { kind: 'error'; error: unknown }

interface BoardSyncController
{
  timer: ReturnType<typeof setTimeout> | null
  queued: PendingBoardSync | null
  inFlight: PendingBoardSync | null
  // short-circuit identical uploads after the last successful push
  lastUploadedSelection: BoardDataSelection | null
}

interface CreateCloudSyncSchedulerOptions
{
  debounceMs: number
  hasBoard: (boardId: BoardId) => boolean
  flush: (work: PendingBoardSync) => Promise<FlushResult>
  persist: (boardId: BoardId, syncState: BoardSyncState) => void
  onError?: (boardId: BoardId, error: unknown) => void
  onConflict?: (boardId: BoardId, serverState: CloudBoardState) => void
  // stop queued work after auth churn
  shouldProceed?: () => boolean
}

export interface SchedulerDisposeOptions
{
  // drain queued work before teardown
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
            options.onConflict?.(work.boardId, result.serverState)
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
