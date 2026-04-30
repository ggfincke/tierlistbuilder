// src/features/platform/preferences/data/cloud/cloudSync.ts
// debounced cloud-sync runner & subscriber for preferences

import type { AppPreferences } from '@tierlistbuilder/contracts/platform/preferences'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import {
  appPreferencesEqual,
  extractAppPreferences,
} from '~/features/platform/preferences/model/appPreferencesExtraction'
import { upsertMyPreferencesImperative } from '~/features/platform/preferences/data/cloud/preferencesRepository'
import {
  clearPreferencesPending,
  markPreferencesSynced,
  stampPreferencesPending,
} from '~/features/platform/preferences/data/local/preferencesSyncMeta'
import {
  createDebouncedSyncRunner,
  type TriggerOptions,
} from '~/shared/lib/sync/debouncedSyncRunner'
import {
  isOfflineError,
  makeOfflineError,
} from '~/features/platform/sync/lib/errors'
import { logger } from '~/shared/lib/logger'

interface CreatePreferencesSyncRunnerOptions
{
  userId: string
  debounceMs: number
  isOnline?: () => boolean
  shouldProceed?: () => boolean
}

interface PreferencesSyncRunner
{
  trigger: (preferences: AppPreferences, options?: TriggerOptions) => void
  dispose: () => Promise<void>
}

// singleton key — preferences are per-user-scoped, so use the same
// symbol for every enqueue. the generic runner's Map handles the rest
const PREFERENCES_KEY = Symbol('preferences')
type PreferencesKey = typeof PREFERENCES_KEY

const createPreferencesSyncRunner = (
  options: CreatePreferencesSyncRunnerOptions
): PreferencesSyncRunner =>
{
  const isOnline = options.isOnline ?? (() => true)
  const runner = createDebouncedSyncRunner<
    PreferencesKey,
    AppPreferences,
    { updatedAt: number }
  >({
    debounceMs: options.debounceMs,
    shouldProceed: options.shouldProceed,
    dedupEqual: appPreferencesEqual,
    onQueue: () => stampPreferencesPending(options.userId),
    onSuccess: ({ updatedAt }) =>
      markPreferencesSynced(options.userId, updatedAt),
    onDedup: () => clearPreferencesPending(options.userId),
    onError: (error) =>
    {
      // suppress the warn for synthetic offline errors — they're expected
      // during disconnects & not worth surfacing per offline edit
      if (isOfflineError(error)) return
      logger.warn('sync', 'Preferences sync failed:', error)
    },
    flush: async (preferences) =>
    {
      // mirror the board scheduler's offline gating: short-circuit so the
      // runner backs off w/o making a doomed network call
      if (!isOnline())
      {
        return { kind: 'error', error: makeOfflineError() }
      }

      try
      {
        const result = await upsertMyPreferencesImperative({ preferences })
        return { kind: 'synced', success: { updatedAt: result.updatedAt } }
      }
      catch (error)
      {
        return { kind: 'error', error }
      }
    },
  })

  return {
    trigger: (preferences, triggerOptions) =>
      runner.enqueue(PREFERENCES_KEY, preferences, triggerOptions),
    dispose: runner.dispose,
  }
}

interface SetupPreferencesCloudSyncOptions
{
  debounceMs: number
  userId: string
  isOnline?: () => boolean
  shouldProceed?: () => boolean
}

export interface PreferencesCloudSyncHandle
{
  runner: PreferencesSyncRunner
  dispose: () => Promise<void>
}

export const setupPreferencesCloudSync = (
  options: SetupPreferencesCloudSyncOptions
): PreferencesCloudSyncHandle =>
{
  const runner = createPreferencesSyncRunner({
    userId: options.userId,
    debounceMs: options.debounceMs,
    isOnline: options.isOnline,
    shouldProceed: options.shouldProceed,
  })

  const unsubscribe = usePreferencesStore.subscribe(
    (state) => extractAppPreferences(state),
    (next) =>
    {
      if (options.shouldProceed && !options.shouldProceed()) return
      runner.trigger(next)
    },
    { equalityFn: appPreferencesEqual }
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
