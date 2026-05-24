// src/app/routes/SettingsRoute.tsx
// /settings route — full-page account settings shell

import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { useThemeSync } from '~/features/platform/preferences/model/useThemeSync'
import { AccountSettingsPage } from '~/features/platform/settings/ui/AccountSettingsPage'
import { LiveRegion } from '~/shared/a11y/LiveRegion'
import { ToastContainer } from '~/shared/notifications/ToastContainer'

export const SettingsRoute = () =>
{
  useThemeSync()
  const reducedMotion = usePreferencesStore((state) => state.reducedMotion)

  return (
    <main className="ambient-layer dot-grid-bg relative min-h-screen bg-[var(--t-bg-page)] text-[var(--t-text)]">
      <AccountSettingsPage />
      <ToastContainer reducedMotion={reducedMotion} />
      <LiveRegion />
    </main>
  )
}
