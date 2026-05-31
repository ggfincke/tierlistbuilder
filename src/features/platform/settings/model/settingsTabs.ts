// src/features/platform/settings/model/settingsTabs.ts
// settings tab registry — slugs, labels, & router-relative path builder

import { SETTINGS_ROUTE_PATH } from '~/shared/routes/pathname'

export const SETTINGS_TABS = [
  { slug: 'profile', label: 'Profile' },
  { slug: 'account', label: 'Account' },
  { slug: 'appearance', label: 'Appearance' },
  { slug: 'privacy', label: 'Privacy' },
  { slug: 'data', label: 'Data' },
] as const

type SettingsTabSlug = (typeof SETTINGS_TABS)[number]['slug']

// router-relative — react-router resolves the basename, so no base path here
export const settingsTabPath = (slug: SettingsTabSlug): string =>
  `${SETTINGS_ROUTE_PATH}/${slug}`
