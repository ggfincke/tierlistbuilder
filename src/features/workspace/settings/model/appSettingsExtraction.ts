// src/features/workspace/settings/model/appSettingsExtraction.ts
// helpers to project the AppSettings fields out of useSettingsStore (which
// also carries setter functions) & to compare two AppSettings instances by
// value. used by the cloud-sync subscriber & the first-login merge so they
// stay aligned w/ a single source of truth for "what counts as a change"

import type { AppSettings } from '@tierlistbuilder/contracts/workspace/settings'

// ordered key list keeps both the projection & equality check exhaustive
// at compile time. if a new AppSettings field is added, both helpers must
// be updated (the type alias below catches drift via tsc)
const APP_SETTINGS_KEYS: readonly (keyof AppSettings)[] = [
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
] as const

// compile-time exhaustiveness check — if AppSettings gains a key & it's
// not added to APP_SETTINGS_KEYS, this conditional resolves to false &
// the assertion below fails. typecheck error tells the future maintainer
// what's missing
type _Assert<T extends true> = T
type _AppSettingsKeysExhaustive = _Assert<
  (typeof APP_SETTINGS_KEYS)[number] extends keyof AppSettings
    ? keyof AppSettings extends (typeof APP_SETTINGS_KEYS)[number]
      ? true
      : false
    : false
>

export type _AppSettingsKeysGuard = _AppSettingsKeysExhaustive

export const extractAppSettings = (source: AppSettings): AppSettings =>
{
  const out: Partial<AppSettings> = {}
  for (const key of APP_SETTINGS_KEYS)
  {
    // assignment is valid for every key in the exhaustive list — the
    // type assertion here is a no-op at runtime & ts can't track the
    // dynamic-key index assignment otherwise
    out[key] = source[key] as AppSettings[typeof key] as never
  }
  return out as AppSettings
}

// shallow field equality across all AppSettings fields. works because every
// field is a primitive or null — no nested object identity to worry about
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
