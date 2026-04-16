// src/features/platform/sync/setupSettingsCloudSync.ts
// installs the settings cloud-sync subscriber. wires useSettingsStore field
// changes to the SettingsSyncRunner & returns a disposer that tears down
// both the subscription & any in-flight flushes.
//
// caller (useCloudSync) decides when to mount this — typically after the
// first-login merge resolves, so the subscriber doesn't fight the merge
// over which value lands first

import type { AppSettings } from '@tierlistbuilder/contracts/workspace/settings'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import {
  appSettingsEqual,
  extractAppSettings,
} from '~/features/workspace/settings/model/appSettingsExtraction'
import { upsertMySettingsImperative } from '~/features/workspace/settings/data/cloud/settingsRepository'
import { useSyncStatusStore } from './syncStatusStore'
import {
  createSettingsSyncRunner,
  type SettingsSyncRunner,
} from './settingsCloudSync'

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
        return { kind: 'error', error: new Error('offline') }
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
      const message = error instanceof Error ? error.message : String(error)
      if (message === 'offline') return
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
