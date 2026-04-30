// src/app/routes/AppChromeLayout.tsx
// persistent route chrome for workspace & marketplace surfaces

import { useCallback, type MouseEvent } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { getWorkspacePath } from '~/shared/routes/pathname'
import { AppTopNav } from '~/app/shells/AppTopNav'
import { ErrorBoundary } from '~/shared/ui/ErrorBoundary'

const WorkspaceSkipLink = () =>
{
  const handleSkipToBoard = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) =>
    {
      event.preventDefault()

      const board = document.getElementById('tier-list')

      if (!(board instanceof HTMLElement))
      {
        return
      }

      board.scrollIntoView({ block: 'start' })
      board.focus({ preventScroll: true })
      window.history.replaceState(null, '', '#tier-list')
    },
    []
  )

  return (
    <a
      href={`${getWorkspacePath()}#tier-list`}
      onClick={handleSkipToBoard}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--t-accent)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--t-accent-foreground)] focus:shadow-lg"
    >
      Skip to board
    </a>
  )
}

export const AppChromeLayout = () =>
{
  const { pathname } = useLocation()

  return (
    <>
      {pathname === '/' && <WorkspaceSkipLink />}
      <ErrorBoundary section="application navigation">
        <AppTopNav />
      </ErrorBoundary>
      <Outlet />
    </>
  )
}
