// src/app/shells/AmbientPageShell.tsx
// ambient route shell w/ theme sync, toast host, & live region

import type { ReactNode } from 'react'

import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { useThemeSync } from '~/features/platform/preferences/model/useThemeSync'
import { LiveRegion } from '~/shared/a11y/LiveRegion'
import { ToastContainer } from '~/shared/notifications/ToastContainer'
import { AMBIENT_PAGE_CLASS } from '~/shared/ui/pageContainer'

interface AmbientPageShellProps
{
  children?: ReactNode
  footer?: ReactNode
  ready?: boolean
}

export const AmbientPageShell = ({
  children,
  footer,
  ready = true,
}: AmbientPageShellProps) =>
{
  useThemeSync()
  const reducedMotion = usePreferencesStore((state) => state.reducedMotion)

  if (!ready)
  {
    return <main className={AMBIENT_PAGE_CLASS} />
  }

  return (
    <main className={AMBIENT_PAGE_CLASS}>
      {children}
      {footer}
      <ToastContainer reducedMotion={reducedMotion} />
      <LiveRegion />
    </main>
  )
}
