// src/features/marketplace/pages/MarketplaceLayout.tsx
// shared chrome for marketplace-adjacent routes: theme sync, top nav, footer,
// toast container, & live region

import { useEffect } from 'react'
import { Outlet, useLocation, useNavigationType } from 'react-router-dom'

import { useThemeSync } from '~/app/bootstrap/useThemeSync'
import { AppTopNav } from '~/app/shells/AppTopNav'
import { LiveRegion } from '~/shared/a11y/LiveRegion'
import { ToastContainer } from '~/shared/notifications/ToastContainer'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import { Footer } from '~/features/marketplace/components/Footer'

export const MarketplaceLayout = () =>
{
  useThemeSync()

  const reducedMotion = useSettingsStore((state) => state.reducedMotion)

  // SPA route changes don't reset window scroll. send pushes/replaces back to
  // the top, but leave back/forward (POP) & in-page anchor jumps alone so
  // browser history feels native
  const { pathname, hash } = useLocation()
  const navType = useNavigationType()
  useEffect(() =>
  {
    if (navType === 'POP') return
    if (hash) return
    window.scrollTo(0, 0)
  }, [pathname, hash, navType])

  return (
    <main className="relative min-h-screen bg-[var(--t-bg-page)] text-[var(--t-text)]">
      <AppTopNav />
      <Outlet />
      <Footer />

      <ToastContainer reducedMotion={reducedMotion} />
      <LiveRegion />
    </main>
  )
}
