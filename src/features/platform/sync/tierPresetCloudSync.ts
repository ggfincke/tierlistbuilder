// src/features/platform/sync/tierPresetCloudSync.ts
// per-preset cloud-sync runner. mirrors cloudSyncScheduler's structure
// (per-key controllers, debounce, exponential backoff, in-flight serial
// per key) but simpler: no conflict path, no cross-tab lock.
//
// the upstream subscriber computes diffs of useTierPresetStore (added /
// removed / content-changed presets) & calls enqueue() per affected
// preset. the runner stamps the local sidecar before scheduling so a tab
// killed mid-debounce still leaves a marker for the next session

import type { UserPresetId } from '@tierlistbuilder/contracts/lib/ids'
import type { TierPreset } from '@tierlistbuilder/contracts/workspace/tierPreset'
import {
  markTierPresetSynced,
  purgeTierPresetSyncMeta,
  stampTierPresetPending,
} from '~/features/workspace/tier-presets/data/local/tierPresetSyncMeta'

const RETRY_MAX_MS = 30_000

// flush input — discriminated on op so 'delete' doesn't drag along an
// unused snapshot field. for upserts the snapshot is the latest known
// state of the preset (subscriber resolves it from useTierPresetStore)
export type TierPresetSyncWork =
  | { presetId: UserPresetId; op: 'upsert'; preset: TierPreset }
  | { presetId: UserPresetId; op: 'delete' }

export type TierPresetFlushResult =
  | { kind: 'synced'; syncedAt: number }
  | { kind: 'error'; error: unknown }

interface CreateTierPresetSyncRunnerOptions
{
  userId: string
  debounceMs: number
  flush: (work: TierPresetSyncWork) => Promise<TierPresetFlushResult>
  onError?: (presetId: UserPresetId, error: unknown) => void
  shouldProceed?: () => boolean
}

interface PresetController
{
  timer: ReturnType<typeof setTimeout> | null
  queued: TierPresetSyncWork | null
  inFlight: TierPresetSyncWork | null
  retryAttempt: number
}

export interface TierPresetSyncTriggerOptions
{
  immediate?: boolean
}

export interface TierPresetSyncRunner
{
  enqueue: (
    work: TierPresetSyncWork,
    options?: TierPresetSyncTriggerOptions
  ) => void
  dispose: () => Promise<void>
}

const computeBackoffDelay = (baseMs: number, retryAttempt: number): number =>
{
  const exponent = Math.min(retryAttempt, 16)
  return Math.min(baseMs * 2 ** exponent, RETRY_MAX_MS)
}

const createController = (): PresetController => ({
  timer: null,
  queued: null,
  inFlight: null,
  retryAttempt: 0,
})

const clearTimer = (controller: PresetController): void =>
{
  if (controller.timer)
  {
    clearTimeout(controller.timer)
    controller.timer = null
  }
}

const isControllerIdle = (controller: PresetController): boolean =>
  controller.timer === null &&
  controller.queued === null &&
  controller.inFlight === null

export const createTierPresetSyncRunner = (
  options: CreateTierPresetSyncRunnerOptions
): TierPresetSyncRunner =>
{
  const controllers = new Map<UserPresetId, PresetController>()
  const inFlightPromises = new Set<Promise<void>>()
  let disposed = false

  const getController = (presetId: UserPresetId): PresetController =>
  {
    const existing = controllers.get(presetId)
    if (existing) return existing
    const created = createController()
    controllers.set(presetId, created)
    return created
  }

  const pruneIfIdle = (
    presetId: UserPresetId,
    controller: PresetController
  ): void =>
  {
    if (isControllerIdle(controller))
    {
      controllers.delete(presetId)
    }
  }

  const scheduleFlush = (
    presetId: UserPresetId,
    controller: PresetController,
    delayMs: number = options.debounceMs
  ): void =>
  {
    clearTimer(controller)
    controller.timer = setTimeout(() =>
    {
      controller.timer = null
      flushQueued(presetId)
    }, delayMs)
  }

  const runFlush = (
    presetId: UserPresetId,
    controller: PresetController,
    work: TierPresetSyncWork
  ): Promise<void> =>
  {
    controller.inFlight = work

    let syncedAt: number | null = null
    let syncErrored = false

    const promise = options
      .flush(work)
      .then(
        (result) =>
        {
          if (disposed) return

          if (result.kind === 'synced')
          {
            syncedAt = result.syncedAt
            controller.retryAttempt = 0

            if (work.op === 'delete')
            {
              purgeTierPresetSyncMeta(work.presetId)
            }
            else
            {
              markTierPresetSynced(
                work.presetId,
                options.userId,
                result.syncedAt
              )
            }
            return
          }

          syncErrored = true
          options.onError?.(presetId, result.error)
        },
        (error) =>
        {
          if (disposed) return
          syncErrored = true
          options.onError?.(presetId, error)
        }
      )
      .finally(() =>
      {
        controller.inFlight = null

        if (disposed)
        {
          return
        }

        // a fresh enqueue arrived during the flush — drain it next
        if (controller.queued && syncedAt !== null)
        {
          flushQueued(presetId)
          return
        }

        if (syncErrored)
        {
          // re-queue the work that just failed so the backoff retry
          // replays the same op rather than racing the next event
          if (!controller.queued)
          {
            controller.queued = work
          }
          const delay = computeBackoffDelay(
            options.debounceMs,
            controller.retryAttempt
          )
          controller.retryAttempt++
          scheduleFlush(presetId, controller, delay)
          return
        }

        if (!controller.queued)
        {
          pruneIfIdle(presetId, controller)
        }
      })

    inFlightPromises.add(promise)
    void promise.finally(() => inFlightPromises.delete(promise))
    return promise
  }

  const flushQueued = (presetId: UserPresetId): void =>
  {
    if (disposed) return

    if (options.shouldProceed && !options.shouldProceed())
    {
      const controller = controllers.get(presetId)
      if (controller)
      {
        controller.queued = null
        clearTimer(controller)
        pruneIfIdle(presetId, controller)
      }
      return
    }

    const controller = controllers.get(presetId)
    if (!controller || controller.inFlight)
    {
      return
    }

    const work = controller.queued
    if (!work)
    {
      pruneIfIdle(presetId, controller)
      return
    }

    controller.queued = null
    void runFlush(presetId, controller, work)
  }

  return {
    enqueue: (work, triggerOptions) =>
    {
      if (disposed) return

      // stamp the sidecar before anything else so a tab killed mid-debounce
      // leaves a trail for the next session's resume helper
      stampTierPresetPending(work.presetId, work.op, options.userId)

      const controller = getController(work.presetId)
      controller.queued = work
      // a fresh edit cancels any pending backoff retry — the user's intent
      // matters more than the backoff progression. failures will rebuild it
      controller.retryAttempt = 0

      if (triggerOptions?.immediate && !controller.inFlight)
      {
        clearTimer(controller)
        flushQueued(work.presetId)
        return
      }

      scheduleFlush(work.presetId, controller)
    },

    dispose: async () =>
    {
      disposed = true

      for (const controller of controllers.values())
      {
        clearTimer(controller)
      }

      // wait for any flushes currently in-flight to settle so the consumer
      // gets a clean tear-down. errors already routed via onError above
      if (inFlightPromises.size > 0)
      {
        await Promise.allSettled([...inFlightPromises])
      }

      controllers.clear()
    },
  }
}
