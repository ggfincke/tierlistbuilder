// src/features/marketplace/pages/MarketplaceLayout.tsx
// marketplace route shell: theme sync, footer, toast container, & live region

import { useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigationType } from 'react-router-dom'

import { useThemeSync } from '~/features/platform/preferences/model/useThemeSync'
import { LiveRegion } from '~/shared/a11y/LiveRegion'
import { ToastContainer } from '~/shared/notifications/ToastContainer'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { Footer } from '~/features/marketplace/components/layout/Footer'

export const MarketplaceLayout = () =>
{
  useThemeSync()

  const reducedMotion = usePreferencesStore((state) => state.reducedMotion)

  const { pathname, hash } = useLocation()
  const navType = useNavigationType()
  const previousPathnameRef = useRef(pathname)

  // Scroll path pushes/replaces to top; leave POP, anchors, & search changes alone
  useEffect(() =>
  {
    const pathnameChanged = previousPathnameRef.current !== pathname
    previousPathnameRef.current = pathname

    if (!pathnameChanged) return
    if (navType === 'POP') return
    if (hash) return
    window.scrollTo(0, 0)
  }, [pathname, hash, navType])

  return (
    <main className="ambient-layer dot-grid-bg relative min-h-screen bg-[var(--t-bg-page)] text-[var(--t-text)]">
      <Outlet />
      <Footer />

      <ToastContainer reducedMotion={reducedMotion} />
      <LiveRegion />
    </main>
  )
}
