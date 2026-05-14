// src/app/routes/MyBoardsRoute.tsx
// /boards route — wraps the local library page shell

import { useAppBootstrap } from '~/app/bootstrap/useAppBootstrap'
import { useThemeSync } from '~/features/platform/preferences/model/useThemeSync'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { MyBoardsPage } from '~/features/library/pages/MyBoardsPage'
import { LiveRegion } from '~/shared/a11y/LiveRegion'
import { ToastContainer } from '~/shared/notifications/ToastContainer'

export const MyBoardsRoute = () =>
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
      <MyBoardsPage />
      <ToastContainer reducedMotion={reducedMotion} />
      <LiveRegion />
    </main>
  )
}
