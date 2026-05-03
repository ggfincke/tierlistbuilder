// src/features/platform/preferences/model/appPreferencesExtraction.ts
// project & compare AppPreferences field values against wider store state

import type { AppPreferences } from '@tierlistbuilder/contracts/platform/preferences'

const APP_PREFERENCES_KEYS = [
  'itemSize',
  'showLabels',
  'defaultLabelPlacementMode',
  'itemShape',
  'compactMode',
  'exportBackgroundOverride',
  'exportItemsPerRow',
  'boardBackgroundOverride',
  'labelWidth',
  'hideRowControls',
  'confirmBeforeDelete',
  'themeId',
  'paletteId',
  'textStyleId',
  'tierLabelBold',
  'tierLabelItalic',
  'tierLabelFontSize',
  'boardLocked',
  'reducedMotion',
  'toolbarPosition',
  'showAltTextButton',
  'autoCropTrimSoftShadows',
] as const satisfies readonly (keyof AppPreferences)[]

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
