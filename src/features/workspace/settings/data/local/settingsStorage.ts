// src/features/workspace/settings/data/local/settingsStorage.ts
// settings persistence config & migration helpers

import { THEMES } from '@/shared/theme/tokens'
import { THEME_PALETTE } from '@/shared/theme/palettes'

// localStorage key for global user settings
export const SETTINGS_STORAGE_KEY = 'tier-list-builder-settings'

export const SETTINGS_STORAGE_VERSION = 12

// migrate persisted settings across schema versions
export const migrateSettingsState = (
  persisted: unknown,
  version: number
): Record<string, unknown> =>
{
  let state = (persisted as Record<string, unknown> | undefined) ?? {}

  if (version < 2)
  {
    state = {
      ...state,
      themeId: state.themeId ?? 'classic',
      textStyleId: state.textStyleId ?? 'default',
    }
  }

  if (version < 3)
  {
    state = {
      ...state,
      tierLabelBold: state.tierLabelBold ?? false,
      tierLabelItalic: state.tierLabelItalic ?? false,
      tierLabelFontSize: state.tierLabelFontSize ?? 'small',
    }
  }

  if (version < 4)
  {
    const themeId = (state.themeId as string) ?? 'classic'
    const oldBg = state.exportBackgroundColor as string | undefined
    const themeBg = THEMES[themeId as keyof typeof THEMES]?.['export-bg']
    state = {
      ...state,
      exportBackgroundOverride: oldBg && oldBg !== themeBg ? oldBg : null,
    }
    delete state.exportBackgroundColor
  }

  if (version < 5)
  {
    delete state.syncTierColorsWithTheme
  }

  if (version < 6)
  {
    state = { ...state, boardLocked: false }
  }

  if (version < 7)
  {
    const themeId = (state.themeId as string) ?? 'classic'
    state = {
      ...state,
      paletteId:
        THEME_PALETTE[themeId as keyof typeof THEME_PALETTE] ?? 'classic',
    }
  }

  if (version < 8 && state.paletteId === 'amoled')
  {
    state = { ...state, paletteId: 'twilight' }
  }

  if (version < 9)
  {
    state = { ...state, reducedMotion: false }
  }

  if (version < 10)
  {
    state = {
      ...state,
      preHighContrastThemeId: null,
      preHighContrastPaletteId: null,
    }
  }

  if (version < 11)
  {
    state = {
      ...state,
      toolbarPosition: 'top',
      showAltTextButton: false,
    }
  }

  if (version < 12)
  {
    state = { ...state, boardBackgroundOverride: null }
  }

  return state
}
