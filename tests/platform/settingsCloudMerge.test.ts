import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '@tierlistbuilder/contracts/workspace/settings'

const { getMySettingsImperativeMock, upsertMySettingsImperativeMock } =
  vi.hoisted(() => ({
    getMySettingsImperativeMock: vi.fn(),
    upsertMySettingsImperativeMock: vi.fn(),
  }))

vi.mock('~/features/workspace/settings/data/cloud/settingsRepository', () => ({
  getMySettingsImperative: getMySettingsImperativeMock,
  upsertMySettingsImperative: upsertMySettingsImperativeMock,
}))

import { mergeSettingsOnFirstLogin } from '~/features/platform/sync/settingsCloudMerge'
import {
  loadSettingsSyncMeta,
  saveSettingsSyncMeta,
} from '~/features/workspace/settings/data/local/settingsSyncMeta'
import { extractAppSettings } from '~/features/workspace/settings/model/appSettingsExtraction'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'

const createMemoryStorage = (): Storage =>
{
  const values = new Map<string, string>()

  return {
    get length()
    {
      return values.size
    },
    clear: () =>
    {
      values.clear()
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) =>
    {
      values.delete(key)
    },
    setItem: (key, value) =>
    {
      values.set(key, value)
    },
  } as Storage
}

const buildCloudSettings = (
  overrides: Partial<AppSettings> = {}
): AppSettings => ({
  ...extractAppSettings(useSettingsStore.getState()),
  ...overrides,
})

describe('settingsCloudMerge', () =>
{
  beforeEach(() =>
  {
    vi.stubGlobal('localStorage', createMemoryStorage())
    getMySettingsImperativeMock.mockReset()
    upsertMySettingsImperativeMock.mockReset()
    useSettingsStore.getState().resetSettings()
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

    getMySettingsImperativeMock.mockResolvedValue(
      buildCloudSettings({
        compactMode: false,
        showLabels: false,
      })
    )
    upsertMySettingsImperativeMock.mockResolvedValue({ updatedAt: 999 })

    const result = await mergeSettingsOnFirstLogin({ userId: 'user-a' })

    expect(result).toEqual({ kind: 'push', updatedAt: 999 })
    expect(upsertMySettingsImperativeMock).toHaveBeenCalledWith({
      settings: localSettings,
    })
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

    getMySettingsImperativeMock.mockResolvedValue(
      buildCloudSettings({
        compactMode: false,
        showLabels: true,
      })
    )

    const result = await mergeSettingsOnFirstLogin({ userId: 'user-b' })

    expect(result.kind).toBe('pull')
    expect(upsertMySettingsImperativeMock).not.toHaveBeenCalled()
    expect(useSettingsStore.getState().compactMode).toBe(false)
    expect(useSettingsStore.getState().showLabels).toBe(true)
    expect(loadSettingsSyncMeta().ownerUserId).toBe('user-b')
  })
})
