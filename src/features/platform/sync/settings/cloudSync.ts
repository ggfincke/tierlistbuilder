// src/features/platform/sync/settings/cloudSync.ts
// debounced cloud-sync runner + subscriber for settings — last-write-wins, no
// conflict path. mounts after first-login merge; backs off on error or offline

import type { AppSettings } from '@tierlistbuilder/contracts/workspace/settings'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import {
  appSettingsEqual,
  extractAppSettings,
} from '~/features/workspace/settings/model/appSettingsExtraction'
import { upsertMySettingsImperative } from '~/features/workspace/settings/data/cloud/settingsRepository'
import {
  clearSettingsPending,
  markSettingsSynced,
  stampSettingsPending,
} from '~/features/workspace/settings/data/local/settingsSyncMeta'
import {
  createDebouncedSyncRunner,
  type TriggerOptions,
} from '~/shared/lib/sync/debouncedSyncRunner'
import {
  isOfflineError,
  makeOfflineError,
} from '~/features/platform/sync/lib/errors'
import { useSyncStatusStore } from '../status/syncStatusStore'

interface CreateSettingsSyncRunnerOptions
{
  userId: string
  debounceMs: number
  shouldProceed?: () => boolean
}

export interface SettingsSyncRunner
{
  trigger: (settings: AppSettings, options?: TriggerOptions) => void
  dispose: () => Promise<void>
}

// singleton key — settings is a per-user-scoped singleton, so we use the same
// symbol for every enqueue. the generic runner's Map handles the rest
const SETTINGS_KEY = Symbol('settings')
type SettingsKey = typeof SETTINGS_KEY

export const createSettingsSyncRunner = (
  options: CreateSettingsSyncRunnerOptions
): SettingsSyncRunner =>
{
  const runner = createDebouncedSyncRunner<
    SettingsKey,
    AppSettings,
    { updatedAt: number }
  >({
    debounceMs: options.debounceMs,
    shouldProceed: options.shouldProceed,
    dedupEqual: appSettingsEqual,
    onQueue: () => stampSettingsPending(options.userId),
    onSuccess: ({ updatedAt }) => markSettingsSynced(options.userId, updatedAt),
    onDedup: () => clearSettingsPending(options.userId),
    onError: (error) =>
    {
      // suppress the warn for synthetic offline errors — they're expected
      // during disconnects & not worth surfacing per offline edit
      if (isOfflineError(error)) return
      console.warn('Settings sync failed:', error)
    },
    flush: async (settings) =>
    {
      // mirror the board scheduler's offline gating: short-circuit so the
      // runner backs off w/o making a doomed network call
      if (!useSyncStatusStore.getState().online)
      {
        return { kind: 'error', error: makeOfflineError() }
      }

      try
      {
        const result = await upsertMySettingsImperative({ settings })
        return { kind: 'synced', success: { updatedAt: result.updatedAt } }
      }
      catch (error)
      {
        return { kind: 'error', error }
      }
    },
  })

  return {
    trigger: (settings, triggerOptions) =>
      runner.enqueue(SETTINGS_KEY, settings, triggerOptions),
    dispose: runner.dispose,
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
