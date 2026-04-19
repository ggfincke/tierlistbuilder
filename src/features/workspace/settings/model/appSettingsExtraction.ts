// src/features/workspace/settings/model/appSettingsExtraction.ts
// project & compare AppSettings field values against wider store state

import type { AppSettings } from '@tierlistbuilder/contracts/workspace/settings'

const APP_SETTINGS_KEYS = [
  'itemSize',
  'showLabels',
  'itemShape',
  'compactMode',
  'exportBackgroundOverride',
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
  'preHighContrastThemeId',
  'preHighContrastPaletteId',
  'toolbarPosition',
  'showAltTextButton',
] as const satisfies readonly (keyof AppSettings)[]

export const extractAppSettings = <T extends AppSettings>(
  source: T
): AppSettings =>
  Object.fromEntries(
    APP_SETTINGS_KEYS.map((key) => [key, source[key]])
  ) as unknown as AppSettings

// shallow field equality across every AppSettings field — valid because
// every field is a primitive or null, no nested identity to worry about
export const appSettingsEqual = (a: AppSettings, b: AppSettings): boolean =>
{
  for (const key of APP_SETTINGS_KEYS)
  {
    if (a[key] !== b[key])
    {
      return false
    }
  }
  return true
}
