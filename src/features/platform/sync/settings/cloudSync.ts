// src/features/platform/sync/settings/cloudSync.ts
// debounced cloud-sync runner + subscriber for settings — last-write-wins, no
// conflict path. mounts after first-login merge; backoff on error or offline

import type { AppSettings } from '@tierlistbuilder/contracts/workspace/settings'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import {
  appSettingsEqual,
  extractAppSettings,
} from '~/features/workspace/settings/model/appSettingsExtraction'
import { upsertMySettingsImperative } from '~/features/workspace/settings/data/cloud/settingsRepository'
import {
  markSettingsSynced,
  stampSettingsPending,
} from '~/features/workspace/settings/data/local/settingsSyncMeta'
import { computeBackoffDelay } from '~/shared/lib/sync/backoff'
import {
  isOfflineError,
  makeOfflineError,
} from '~/shared/lib/sync/offlineError'
import { useSyncStatusStore } from '../status/syncStatusStore'

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

interface SetupSettingsCloudSyncOptions
{
  debounceMs: number
  userId: string
  shouldProceed?: () => boolean
}

export interface SettingsCloudSyncHandle
{
  // expose the runner so callers (resumePendingSyncs) can trigger an
  // immediate flush w/o waiting for a fresh user edit
  runner: SettingsSyncRunner
  dispose: () => Promise<void>
}

export const setupSettingsCloudSync = (
  options: SetupSettingsCloudSyncOptions
): SettingsCloudSyncHandle =>
{
  const runner = createSettingsSyncRunner({
    userId: options.userId,
    debounceMs: options.debounceMs,
    shouldProceed: options.shouldProceed,
    flush: async (settings: AppSettings) =>
    {
      if (options.shouldProceed && !options.shouldProceed())
      {
        return { kind: 'error', error: new Error('auth changed mid-flush') }
      }

      // mirror the board scheduler's offline gating: short-circuit so the
      // runner backs off w/o making a doomed network call
      if (!useSyncStatusStore.getState().online)
      {
        return { kind: 'error', error: makeOfflineError() }
      }

      try
      {
        const result = await upsertMySettingsImperative({ settings })
        return { kind: 'synced', updatedAt: result.updatedAt }
      }
      catch (error)
      {
        return { kind: 'error', error }
      }
    },
    onError: (error) =>
    {
      // suppress the warn for synthetic offline errors — they're expected
      // during disconnects & not worth surfacing per offline edit
      if (isOfflineError(error)) return
      console.warn('Settings sync failed:', error)
    },
  })

  const unsubscribe = useSettingsStore.subscribe(
    (state) => extractAppSettings(state),
    (next) =>
    {
      if (options.shouldProceed && !options.shouldProceed()) return
      runner.trigger(next)
    },
    { equalityFn: appSettingsEqual }
  )

  return {
    runner,
    dispose: async () =>
    {
      unsubscribe()
      await runner.dispose()
    },
  }
}
