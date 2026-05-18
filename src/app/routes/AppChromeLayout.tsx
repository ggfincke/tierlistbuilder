// src/app/routes/AppChromeLayout.tsx
// persistent route chrome for workspace & library surfaces

import { useCallback, useEffect, type MouseEvent } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { useAppBootstrap, useAppReady } from '~/app/bootstrap/useAppBootstrap'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { useSignInPromptStore } from '~/features/platform/auth/model/useSignInPromptStore'
import { useCloudSync } from '~/app/sync/useCloudSync'
import { getWorkspacePath } from '~/shared/routes/pathname'
import { AppTopNav } from '~/app/shells/topNav/AppTopNav'
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
  // single bootstrap-owner for the chrome-wrapped routes; child routes
  // subscribe via useAppReady so each nav doesn't re-register hydration
  // listeners or run its own bootstrap effect
  useAppBootstrap()
  const appReady = useAppReady()
  const session = useAuthSession()
  const signInPromptOpen = useSignInPromptStore((state) => state.open)
  const hideSignInPrompt = useSignInPromptStore((state) => state.hide)

  useCloudSync(appReady && session.status === 'signed-in' ? session.user : null)

  useEffect(() =>
  {
    if (session.status === 'signed-in' && signInPromptOpen)
    {
      hideSignInPrompt()
    }
  }, [hideSignInPrompt, session.status, signInPromptOpen])

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
