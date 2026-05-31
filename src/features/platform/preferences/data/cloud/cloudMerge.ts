// src/features/platform/preferences/data/cloud/cloudMerge.ts
// first-login preferences merge; pending edit -> push, else cloud -> pull

import type {
  AppPreferences,
  CloudPreferencesRead,
} from '@tierlistbuilder/contracts/platform/preferences'
import {
  getMyPreferencesImperative,
  upsertMyPreferencesImperative,
} from '~/features/platform/preferences/data/cloud/preferencesRepository'
import {
  loadPreferencesSyncMetaForUser,
  markPreferencesSynced,
  stampPreferencesPending,
} from '~/features/platform/preferences/data/local/preferencesSyncMeta'
import {
  appPreferencesEqual,
  extractAppPreferences,
} from '~/features/platform/preferences/model/appPreferencesExtraction'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { makeProceedGuard } from '~/shared/lib/sync/proceedGuard'

type PreferencesMergeResult =
  | { kind: 'push'; updatedAt: number }
  | { kind: 'pull'; updatedAt: number }
  | { kind: 'noop' }
  | { kind: 'aborted' }
  | { kind: 'error'; error: unknown }

// repository surface injected by callers — production wires the convex
// imperative adapters; tests pass in-memory fakes so the merge logic can
// run w/o vi.mock around the cloud module
export interface PreferencesMergeDeps
{
  getMyPreferences: () => Promise<CloudPreferencesRead | null>
  upsertMyPreferences: (args: {
    preferences: AppPreferences
  }) => Promise<{ updatedAt: number }>
}

const DEFAULT_PREFERENCES_MERGE_DEPS: PreferencesMergeDeps = {
  getMyPreferences: getMyPreferencesImperative,
  upsertMyPreferences: upsertMyPreferencesImperative,
}

interface MergePreferencesOptions
{
  userId: string
  shouldProceed?: () => boolean
  deps?: PreferencesMergeDeps
}

// load AppPreferences into the store w/o tripping the subscriber — caller arms
// the subscriber AFTER merge resolves so this store-load is invisible
const applyAppPreferencesToStore = (preferences: AppPreferences): void =>
{
  // usePreferencesStore's setState merges into the existing state, preserving
  // the setter functions. we pass the AppPreferences fields directly
  usePreferencesStore.setState(preferences)
}

export const mergePreferencesOnFirstLogin = async ({
  userId,
  shouldProceed,
  deps = DEFAULT_PREFERENCES_MERGE_DEPS,
}: MergePreferencesOptions): Promise<PreferencesMergeResult> =>
{
  const canProceed = makeProceedGuard(shouldProceed)
  const unsubscribe = usePreferencesStore.subscribe(
    (state) => extractAppPreferences(state),
    () =>
    {
      if (!canProceed()) return
      stampPreferencesPending(userId)
    },
    { equalityFn: appPreferencesEqual }
  )

  try
  {
    if (!canProceed())
    {
      return { kind: 'aborted' }
    }

    let cloudRead: CloudPreferencesRead | null
    try
    {
      cloudRead = await deps.getMyPreferences()
    }
    catch (error)
    {
      return { kind: 'error', error }
    }

    if (!canProceed())
    {
      return { kind: 'aborted' }
    }

    const sidecar = loadPreferencesSyncMetaForUser(userId)
    const hasPendingLocal = sidecar.pendingSyncAt !== null

    // pull path: cloud non-null & local has no pending edit. apply cloud &
    // stamp the sidecar w/ the cloud row's actual updatedAt so future merges
    // can compare timestamps correctly
    if (cloudRead !== null && !hasPendingLocal)
    {
      applyAppPreferencesToStore(cloudRead.preferences)
      markPreferencesSynced(userId, cloudRead.updatedAt)
      return { kind: 'pull', updatedAt: cloudRead.updatedAt }
    }

    // push path: either cloud is empty, or local has pending edits we don't
    // want to lose. send the local state up
    const localPreferences = extractAppPreferences(
      usePreferencesStore.getState()
    )
    try
    {
      const result = await deps.upsertMyPreferences({
        preferences: localPreferences,
      })
      if (!canProceed())
      {
        return { kind: 'aborted' }
      }
      markPreferencesSynced(userId, result.updatedAt)
      return { kind: 'push', updatedAt: result.updatedAt }
    }
    catch (error)
    {
      return { kind: 'error', error }
    }
  }
  finally
  {
    unsubscribe()
  }
}
