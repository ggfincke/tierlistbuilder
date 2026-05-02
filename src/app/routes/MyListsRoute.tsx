// src/app/routes/MyListsRoute.tsx
// /boards route — wraps the local library page shell

import { useAppBootstrap } from '~/app/bootstrap/useAppBootstrap'
import { useThemeSync } from '~/features/platform/preferences/model/useThemeSync'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { MyListsPage } from '~/features/library/pages/MyListsPage'
import { LiveRegion } from '~/shared/a11y/LiveRegion'
import { ToastContainer } from '~/shared/notifications/ToastContainer'

export const MyListsRoute = () =>
{
  const appReady = useAppBootstrap()
  useThemeSync()
  const reducedMotion = usePreferencesStore((state) => state.reducedMotion)

  if (!appReady)
  {
    return (
      <main className="relative min-h-screen bg-[var(--t-bg-page)] text-[var(--t-text)]" />
    )
  }

  return (
    <main className="relative min-h-screen bg-[var(--t-bg-page)] text-[var(--t-text)]">
      <MyListsPage />
      <ToastContainer reducedMotion={reducedMotion} />
      <LiveRegion />
    </main>
  )
}
