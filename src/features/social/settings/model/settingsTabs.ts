// src/features/social/settings/model/settingsTabs.ts
// settings tab registry: slugs, labels, & route helper

import type { SettingsTabSlug } from '~/shared/routes/settings'
export { settingsTabPath, type SettingsTabSlug } from '~/shared/routes/settings'

export const SETTINGS_TABS = [
  { slug: 'profile', label: 'Profile' },
  { slug: 'account', label: 'Account' },
  { slug: 'appearance', label: 'Appearance' },
  { slug: 'privacy', label: 'Privacy' },
  { slug: 'data', label: 'Data' },
] as const satisfies readonly { slug: SettingsTabSlug; label: string }[]
