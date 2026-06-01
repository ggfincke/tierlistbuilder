// tests/cloud-sync/preferencesCloudMerge.test.ts
// preferences cloud merge strategy

import { beforeEach, describe, expect, it } from 'vitest'
import type { AppPreferences } from '@tierlistbuilder/contracts/platform/preferences'
import {
  mergePreferencesOnFirstLogin,
  type PreferencesMergeDeps,
} from '~/features/platform/preferences/data/cloud/cloudMerge'
import {
  loadPreferencesSyncMeta,
  savePreferencesSyncMeta,
} from '~/features/platform/preferences/data/local/preferencesSyncMeta'
import { extractAppPreferences } from '~/features/platform/preferences/model/appPreferencesExtraction'
import {
  DEFAULT_APP_PREFERENCES,
  usePreferencesStore,
} from '~/features/platform/preferences/model/usePreferencesStore'

const buildCloudPreferences = (
  overrides: Partial<AppPreferences> = {}
): AppPreferences => ({
  ...extractAppPreferences(usePreferencesStore.getState()),
  ...overrides,
})

interface FakeDepsConfig
{
  cloudPreferences?: AppPreferences | null
  cloudUpdatedAt?: number
  upsertResult?: { updatedAt: number }
}

interface FakeDeps
{
  deps: PreferencesMergeDeps
  upsertCalls: { preferences: AppPreferences }[]
}

// in-memory deps that record calls — the production wiring uses convex
// adapters, but the merge logic only cares about the surface contract
const createFakeDeps = (config: FakeDepsConfig = {}): FakeDeps =>
{
  const upsertCalls: { preferences: AppPreferences }[] = []
  return {
    upsertCalls,
    deps: {
      getMyPreferences: async () =>
        config.cloudPreferences
          ? {
              preferences: config.cloudPreferences,
              updatedAt: config.cloudUpdatedAt ?? 1,
            }
          : null,
      upsertMyPreferences: async (args) =>
      {
        upsertCalls.push(args)
        return config.upsertResult ?? { updatedAt: 1 }
      },
    },
  }
}

describe('preferencesCloudMerge', () =>
{
  beforeEach(() =>
  {
    usePreferencesStore.setState(DEFAULT_APP_PREFERENCES)
  })

  it('pushes local preferences when the pending sidecar belongs to the signed-in user', async () =>
  {
    usePreferencesStore.setState({
      compactMode: true,
      showLabels: true,
    })
    const localPreferences = extractAppPreferences(
      usePreferencesStore.getState()
    )

    savePreferencesSyncMeta({
      pendingSyncAt: 123,
      lastSyncedAt: 50,
      ownerUserId: 'user-a',
    })

    const { deps, upsertCalls } = createFakeDeps({
      cloudPreferences: buildCloudPreferences({
        compactMode: false,
        showLabels: false,
      }),
      upsertResult: { updatedAt: 999 },
    })

    const result = await mergePreferencesOnFirstLogin({
      userId: 'user-a',
      deps,
    })

    expect(result).toEqual({ kind: 'push', updatedAt: 999 })
    expect(upsertCalls).toEqual([{ preferences: localPreferences }])
    expect(usePreferencesStore.getState().compactMode).toBe(true)
    expect(usePreferencesStore.getState().showLabels).toBe(true)
    expect(loadPreferencesSyncMeta()).toEqual({
      pendingSyncAt: null,
      lastSyncedAt: 999,
      ownerUserId: 'user-a',
    })
  })

  it('pushes local preferences when the user edits during the merge fetch window', async () =>
  {
    let resolveCloud!: (value: AppPreferences) => void
    const upsertCalls: { preferences: AppPreferences }[] = []
    const deps: PreferencesMergeDeps = {
      getMyPreferences: async () =>
      {
        const preferences = await new Promise<AppPreferences>((resolve) =>
        {
          resolveCloud = resolve
        })
        return { preferences, updatedAt: 10 }
      },
      upsertMyPreferences: async (args) =>
      {
        upsertCalls.push(args)
        return { updatedAt: 20 }
      },
    }

    const mergePromise = mergePreferencesOnFirstLogin({
      userId: 'user-a',
      deps,
    })
    usePreferencesStore.setState({
      compactMode: true,
      showLabels: true,
    })
    const localPreferences = extractAppPreferences(
      usePreferencesStore.getState()
    )
    resolveCloud(
      buildCloudPreferences({
        compactMode: false,
        showLabels: false,
      })
    )

    const result = await mergePromise

    expect(result).toEqual({ kind: 'push', updatedAt: 20 })
    expect(upsertCalls).toEqual([{ preferences: localPreferences }])
    expect(usePreferencesStore.getState().compactMode).toBe(true)
    expect(usePreferencesStore.getState().showLabels).toBe(true)
    expect(loadPreferencesSyncMeta()).toEqual({
      pendingSyncAt: null,
      lastSyncedAt: 20,
      ownerUserId: 'user-a',
    })
  })

  it('ignores a different user’s pending sidecar & pulls cloud preferences instead', async () =>
  {
    usePreferencesStore.setState({
      compactMode: true,
      showLabels: false,
    })

    savePreferencesSyncMeta({
      pendingSyncAt: 123,
      lastSyncedAt: 50,
      ownerUserId: 'user-a',
    })

    const { deps, upsertCalls } = createFakeDeps({
      cloudPreferences: buildCloudPreferences({
        compactMode: false,
        showLabels: true,
      }),
    })

    const result = await mergePreferencesOnFirstLogin({
      userId: 'user-b',
      deps,
    })

    expect(result.kind).toBe('pull')
    expect(upsertCalls).toEqual([])
    expect(usePreferencesStore.getState().compactMode).toBe(false)
    expect(usePreferencesStore.getState().showLabels).toBe(true)
    expect(loadPreferencesSyncMeta().ownerUserId).toBe('user-b')
  })
})
