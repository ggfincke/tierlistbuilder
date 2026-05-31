// tests/platform/preferencesPersistence.test.ts
// local preferences persistence version handling

import { beforeEach, describe, expect, it } from 'vitest'
import {
  PREFERENCES_STORAGE_KEY,
  PREFERENCES_STORAGE_VERSION,
} from '~/features/platform/preferences/data/local/preferencesStorage'
import {
  DEFAULT_APP_PREFERENCES,
  usePreferencesStore,
} from '~/features/platform/preferences/model/usePreferencesStore'

describe('preferences persistence', () =>
{
  beforeEach(() =>
  {
    usePreferencesStore.setState(DEFAULT_APP_PREFERENCES)
  })

  it('resets version-mismatched persisted preferences to current defaults', async () =>
  {
    usePreferencesStore.setState({
      compactMode: true,
      themeId: 'volt',
    })
    localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        state: {
          ...DEFAULT_APP_PREFERENCES,
          compactMode: true,
          themeId: 'classic',
        },
        version: PREFERENCES_STORAGE_VERSION - 1,
      })
    )

    await usePreferencesStore.persist.rehydrate()

    const state = usePreferencesStore.getState()
    expect(state.themeId).toBe(DEFAULT_APP_PREFERENCES.themeId)
    expect(state.compactMode).toBe(DEFAULT_APP_PREFERENCES.compactMode)

    const stored = JSON.parse(
      localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? '{}'
    ) as {
      state?: { compactMode?: boolean; themeId?: string }
      version?: number
    }
    expect(stored.version).toBe(PREFERENCES_STORAGE_VERSION)
    expect(stored.state?.themeId).toBe(DEFAULT_APP_PREFERENCES.themeId)
    expect(stored.state?.compactMode).toBe(DEFAULT_APP_PREFERENCES.compactMode)
  })
})
