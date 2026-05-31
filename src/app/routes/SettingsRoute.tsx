// src/app/routes/SettingsRoute.tsx
// /settings route — full-page account settings shell

import { AccountSettingsPage } from '~/features/platform/settings/ui/AccountSettingsPage'
import { AmbientPageShell } from '~/shared/ui/AmbientPageShell'

export const SettingsRoute = () => (
  <AmbientPageShell>
    <AccountSettingsPage />
  </AmbientPageShell>
)
