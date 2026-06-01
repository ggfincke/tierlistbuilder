// src/shared/routes/settings.ts
// settings route helpers for callers outside the social settings slice

import { SETTINGS_ROUTE_PATH } from './pathname'

export type SettingsTabSlug =
  | 'profile'
  | 'account'
  | 'appearance'
  | 'privacy'
  | 'data'

// React Router resolves the basename, so this remains router-relative
export const settingsTabPath = (slug: SettingsTabSlug): string =>
  `${SETTINGS_ROUTE_PATH}/${slug}`
