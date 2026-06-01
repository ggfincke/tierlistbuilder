// src/app/routes/SettingsRoute.tsx
// /settings route — full-page account settings shell

import { AccountSettingsPage } from '~/features/platform/settings/pages/AccountSettingsPage'
import { AmbientPageShell } from '~/app/shells/AmbientPageShell'

export const SettingsRoute = () => (
  <AmbientPageShell>
    <AccountSettingsPage />
  </AmbientPageShell>
)
