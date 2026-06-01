// src/app/routes/SettingsRoute.tsx
// /settings route: full-page account settings shell

import { AccountSettingsPage } from '~/features/social/settings/pages/AccountSettingsPage'
import { AmbientPageShell } from '~/app/shells/AmbientPageShell'

export const SettingsRoute = () => (
  <AmbientPageShell>
    <AccountSettingsPage />
  </AmbientPageShell>
)
