// src/app/routes/ProfileRoute.tsx
// /u/:handle route — public profile shell

import { useParams } from 'react-router-dom'

import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { useThemeSync } from '~/features/platform/preferences/model/useThemeSync'
import { ProfilePage } from '~/features/platform/profile/ui/ProfilePage'
import { LiveRegion } from '~/shared/a11y/LiveRegion'
import { ToastContainer } from '~/shared/notifications/ToastContainer'

export const ProfileRoute = () =>
{
  useThemeSync()
  const reducedMotion = usePreferencesStore((state) => state.reducedMotion)
  const { handle } = useParams<{ handle: string }>()

  return (
    <main className="ambient-layer dot-grid-bg relative min-h-screen bg-[var(--t-bg-page)] text-[var(--t-text)]">
      <ProfilePage handle={handle ?? ''} />
      <ToastContainer reducedMotion={reducedMotion} />
      <LiveRegion />
    </main>
  )
}
