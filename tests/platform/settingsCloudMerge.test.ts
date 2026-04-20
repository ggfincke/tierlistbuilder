// tests/platform/settingsCloudMerge.test.ts
// settings cloud merge strategy

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '@tierlistbuilder/contracts/workspace/settings'
import {
  mergeSettingsOnFirstLogin,
  type SettingsMergeDeps,
} from '~/features/workspace/settings/data/cloud/cloudMerge'
import {
  loadSettingsSyncMeta,
  saveSettingsSyncMeta,
} from '~/features/workspace/settings/data/local/settingsSyncMeta'
import { extractAppSettings } from '~/features/workspace/settings/model/appSettingsExtraction'
import {
  DEFAULT_APP_SETTINGS,
  useSettingsStore,
} from '~/features/workspace/settings/model/useSettingsStore'
import { createMemoryStorage } from '../utils/memoryStorage'

const buildCloudSettings = (
  overrides: Partial<AppSettings> = {}
): AppSettings => ({
  ...extractAppSettings(useSettingsStore.getState()),
  ...overrides,
})

interface FakeDepsConfig
{
  cloudSettings?: AppSettings | null
  cloudUpdatedAt?: number
  upsertResult?: { updatedAt: number }
}

interface FakeDeps
{
  deps: SettingsMergeDeps
  upsertCalls: { settings: AppSettings }[]
}

// in-memory deps that record calls — the production wiring uses convex
// adapters, but the merge logic only cares about the surface contract
const createFakeDeps = (config: FakeDepsConfig = {}): FakeDeps =>
{
  const upsertCalls: { settings: AppSettings }[] = []
  return {
    upsertCalls,
    deps: {
      getMySettings: async () =>
        config.cloudSettings
          ? {
              settings: config.cloudSettings,
              updatedAt: config.cloudUpdatedAt ?? 1,
            }
          : null,
      upsertMySettings: async (args) =>
      {
        upsertCalls.push(args)
        return config.upsertResult ?? { updatedAt: 1 }
      },
    },
  }
}

describe('settingsCloudMerge', () =>
{
  beforeEach(() =>
  {
    vi.stubGlobal('localStorage', createMemoryStorage())
    useSettingsStore.setState(DEFAULT_APP_SETTINGS)
  })

  afterEach(() =>
  {
    vi.unstubAllGlobals()
  })

  it('pushes local settings when the pending sidecar belongs to the signed-in user', async () =>
  {
    useSettingsStore.setState({
      compactMode: true,
      showLabels: true,
    })
    const localSettings = extractAppSettings(useSettingsStore.getState())

    saveSettingsSyncMeta({
      pendingSyncAt: 123,
      lastSyncedAt: 50,
      ownerUserId: 'user-a',
    })

    const { deps, upsertCalls } = createFakeDeps({
      cloudSettings: buildCloudSettings({
        compactMode: false,
        showLabels: false,
      }),
      upsertResult: { updatedAt: 999 },
    })

    const result = await mergeSettingsOnFirstLogin({ userId: 'user-a', deps })

    expect(result).toEqual({ kind: 'push', updatedAt: 999 })
    expect(upsertCalls).toEqual([{ settings: localSettings }])
    expect(useSettingsStore.getState().compactMode).toBe(true)
    expect(useSettingsStore.getState().showLabels).toBe(true)
    expect(loadSettingsSyncMeta()).toEqual({
      pendingSyncAt: null,
      lastSyncedAt: 999,
      ownerUserId: 'user-a',
    })
  })

  it('ignores a different user’s pending sidecar & pulls cloud settings instead', async () =>
  {
    useSettingsStore.setState({
      compactMode: true,
      showLabels: false,
    })

    saveSettingsSyncMeta({
      pendingSyncAt: 123,
      lastSyncedAt: 50,
      ownerUserId: 'user-a',
    })

    const { deps, upsertCalls } = createFakeDeps({
      cloudSettings: buildCloudSettings({
        compactMode: false,
        showLabels: true,
      }),
    })

    const result = await mergeSettingsOnFirstLogin({ userId: 'user-b', deps })

    expect(result.kind).toBe('pull')
    expect(upsertCalls).toEqual([])
    expect(useSettingsStore.getState().compactMode).toBe(false)
    expect(useSettingsStore.getState().showLabels).toBe(true)
    expect(loadSettingsSyncMeta().ownerUserId).toBe('user-b')
  })
})
