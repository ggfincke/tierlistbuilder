// src/features/marketplace/pages/MarketplaceLayout.tsx
// marketplace route shell: theme sync, footer, toast container, & live region

import { useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigationType } from 'react-router-dom'

import { Footer } from '~/features/marketplace/ui/layout/Footer'
import { AmbientPageShell } from '~/shared/ui/AmbientPageShell'

export const MarketplaceLayout = () =>
{
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
    <AmbientPageShell footer={<Footer />}>
      <Outlet />
    </AmbientPageShell>
  )
}
