// src/features/platform/sync/settingsCloudSync.ts
// debounced cloud-sync runner for the global settings doc. simpler than
// cloudSyncScheduler since there's no per-board map, no conflict path, &
// no cross-tab lock — settings are last-write-wins by design.
//
// responsibilities:
//   - stamp pendingSyncAt on the local sidecar as soon as a change arrives
//     (survives tab close)
//   - debounce successive edits into a single flush
//   - on success: clear pendingSyncAt & advance lastSyncedAt
//   - on error: exponential backoff retry (resets to base delay on next
//     fresh edit, matching the board scheduler's approach)
//   - on offline: surface a synthetic 'offline' error so the runner backs
//     off w/o spamming the network. resume runs when connectivity returns

import type { AppSettings } from '@tierlistbuilder/contracts/workspace/settings'
import {
  markSettingsSynced,
  stampSettingsPending,
} from '~/features/workspace/settings/data/local/settingsSyncMeta'

// retry backoff cap mirrors cloudSyncScheduler's RETRY_MAX_MS (30s) so
// repeated transient failures don't eat infinite battery on offline phones
const RETRY_MAX_MS = 30_000

export type SettingsFlushResult =
  | { kind: 'synced'; updatedAt: number }
  | { kind: 'error'; error: unknown }

interface CreateSettingsSyncRunnerOptions
{
  userId: string
  // base debounce window. cloudSyncScheduler uses 2.5s — we follow suit
  // for consistent UX between board edits & settings toggles
  debounceMs: number
  // flush implementation — receives the most recent settings snapshot.
  // swap for a fake in tests; in prod this calls upsertMySettingsImperative
  flush: (settings: AppSettings) => Promise<SettingsFlushResult>
  onError?: (error: unknown) => void
  // gate to drop queued work if auth changed mid-debounce. matches the
  // shouldProceed semantics used by useCloudSync's other subscribers
  shouldProceed?: () => boolean
}

export interface SettingsSyncTriggerOptions
{
  // skip the debounce & flush as soon as the runner is free. used by the
  // resume helper after sign-in to drain a tab-survived pendingSyncAt
  immediate?: boolean
}

export interface SettingsSyncRunner
{
  trigger: (settings: AppSettings, options?: SettingsSyncTriggerOptions) => void
  // drain in-flight & queued work then prevent further scheduling. returns
  // when any current flush settles so callers can await tear-down cleanly
  dispose: () => Promise<void>
}

const computeBackoffDelay = (baseMs: number, retryAttempt: number): number =>
{
  const exponent = Math.min(retryAttempt, 16)
  const computed = baseMs * 2 ** exponent
  return Math.min(computed, RETRY_MAX_MS)
}

export const createSettingsSyncRunner = (
  options: CreateSettingsSyncRunnerOptions
): SettingsSyncRunner =>
{
  let timer: ReturnType<typeof setTimeout> | null = null
  let queued: AppSettings | null = null
  let inFlight: Promise<void> | null = null
  let retryAttempt = 0
  let disposed = false

  const clearTimer = (): void =>
  {
    if (timer)
    {
      clearTimeout(timer)
      timer = null
    }
  }

  const scheduleFlush = (delayMs: number = options.debounceMs): void =>
  {
    clearTimer()
    timer = setTimeout(() =>
    {
      timer = null
      void runFlush()
    }, delayMs)
  }

  const runFlush = async (): Promise<void> =>
  {
    if (disposed)
    {
      return
    }

    if (options.shouldProceed && !options.shouldProceed())
    {
      // auth churn — drop queued work so the previous user's edits don't
      // ride the next user's session
      queued = null
      return
    }

    if (inFlight)
    {
      // another flush is already in progress; the finally block will
      // re-schedule if there's still queued work after it lands
      return
    }

    const work = queued
    if (!work)
    {
      return
    }

    queued = null

    const promise = options
      .flush(work)
      .then(
        (result) =>
        {
          if (disposed) return

          if (result.kind === 'synced')
          {
            retryAttempt = 0
            markSettingsSynced(options.userId, result.updatedAt)
            return
          }

          options.onError?.(result.error)
          // re-queue the work that just failed so the backoff retry replays
          // the same edit (rather than racing the next one)
          if (!queued)
          {
            queued = work
          }
          const delay = computeBackoffDelay(options.debounceMs, retryAttempt)
          retryAttempt++
          scheduleFlush(delay)
        },
        (error) =>
        {
          if (disposed) return

          options.onError?.(error)
          if (!queued)
          {
            queued = work
          }
          const delay = computeBackoffDelay(options.debounceMs, retryAttempt)
          retryAttempt++
          scheduleFlush(delay)
        }
      )
      .finally(() =>
      {
        inFlight = null
        // a fresh edit may have queued during the flush — drain it now
        if (!disposed && queued && !timer)
        {
          scheduleFlush()
        }
      })

    inFlight = promise
    await promise
  }

  return {
    trigger: (settings, triggerOptions) =>
    {
      if (disposed) return

      // stamp pending immediately so a tab killed during the debounce
      // window leaves a marker for the next session's resume helper
      stampSettingsPending(options.userId)

      queued = settings
      // a fresh user edit cancels the backoff progression. the next flush
      // uses the standard debounce delay; if it fails again, the counter
      // restarts from 0
      retryAttempt = 0

      if (triggerOptions?.immediate && !inFlight)
      {
        clearTimer()
        void runFlush()
        return
      }

      scheduleFlush()
    },
    dispose: async () =>
    {
      disposed = true
      clearTimer()
      queued = null

      // wait for any in-flight flush to settle so the consumer gets a
      // clean shutdown. swallow errors — the runner already routed them
      // through onError when they happened
      if (inFlight)
      {
        try
        {
          await inFlight
        }
        catch
        {
          // already reported via onError
        }
      }
    },
  }
}
