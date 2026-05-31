// src/features/platform/preferences/model/appPreferencesExtraction.ts
// project & compare AppPreferences field values against wider store state

import type { AppPreferences } from '@tierlistbuilder/contracts/platform/preferences'

const APP_PREFERENCES_KEY_MAP = {
  itemSize: true,
  showLabels: true,
  defaultLabelPlacementMode: true,
  defaultLabelFontSizePx: true,
  itemShape: true,
  compactMode: true,
  exportBackgroundOverride: true,
  exportItemsPerRow: true,
  boardBackgroundOverride: true,
  labelWidth: true,
  hideRowControls: true,
  confirmBeforeDelete: true,
  themeId: true,
  paletteId: true,
  textStyleId: true,
  tierLabelBold: true,
  tierLabelItalic: true,
  tierLabelFontSize: true,
  boardLocked: true,
  topNavLocked: true,
  reducedMotion: true,
  toolbarPosition: true,
  showItemEditButton: true,
  autoCropTrimSoftShadows: true,
} as const satisfies Record<keyof AppPreferences, true>

const APP_PREFERENCES_KEYS = Object.keys(
  APP_PREFERENCES_KEY_MAP
) as (keyof AppPreferences)[]

export const extractAppPreferences = <T extends AppPreferences>(
  source: T
): AppPreferences =>
{
  const result = {} as Partial<AppPreferences>
  for (const key of APP_PREFERENCES_KEYS)
  {
    ;(result as Record<string, unknown>)[key] = source[key]
  }
  return result as AppPreferences
}

// shallow field equality across every AppPreferences field — valid because
// every field is a primitive or null, no nested identity to worry about
export const appPreferencesEqual = (
  a: AppPreferences,
  b: AppPreferences
): boolean =>
{
  for (const key of APP_PREFERENCES_KEYS)
  {
    if (a[key] !== b[key])
    {
      return false
    }
  }
  return true
}
