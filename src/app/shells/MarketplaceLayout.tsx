// src/app/shells/MarketplaceLayout.tsx
// marketplace route shell w/ footer, path scroll reset, & ambient chrome

import { useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigationType } from 'react-router-dom'

import { Footer } from '~/features/marketplace/ui/layout/Footer'
import { AmbientPageShell } from '~/app/shells/AmbientPageShell'

export const MarketplaceLayout = () =>
{
  const { pathname, hash } = useLocation()
  const navType = useNavigationType()
  const previousPathnameRef = useRef(pathname)

  // Reset path pushes/replaces to top; leave POP, anchors, & search changes alone
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
