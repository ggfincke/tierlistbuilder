// src/app/routes/AppRouter.tsx
// app-level router that selects the workspace, embed, or not-found route

import { lazy, Suspense, useSyncExternalStore } from 'react'

import { ErrorBoundary } from '~/shared/ui/ErrorBoundary'
import { NotFoundRoute } from './NotFoundRoute'
import { resolveAppRoute } from './pathname'
import { WorkspaceRoute } from './WorkspaceRoute'

// EmbedRoute ships shared/board-ui + EmbedView which workspace users never
// hit — lazy load keeps them out of the primary bundle
const EmbedRoute = lazy(() =>
  import('./EmbedRoute').then((m) => ({ default: m.EmbedRoute }))
)

const subscribeToLocation = (onChange: () => void): (() => void) =>
{
  window.addEventListener('popstate', onChange)
  return () => window.removeEventListener('popstate', onChange)
}

const getLocationPathname = (): string => window.location.pathname

// empty page-color shell while the embed chunk arrives — matches the locked
// dark theme EmbedShell applies once mounted so there's no flash on load
const EmbedFallback = () => (
  <main className="min-h-screen bg-[var(--t-bg-page)]" />
)

export const AppRouter = () =>
{
  const pathname = useSyncExternalStore(
    subscribeToLocation,
    getLocationPathname,
    () => '/'
  )

  const route = resolveAppRoute(pathname)

  switch (route.kind)
  {
    case 'embed':
      return (
        <ErrorBoundary section="embedded board">
          <Suspense fallback={<EmbedFallback />}>
            <EmbedRoute />
          </Suspense>
        </ErrorBoundary>
      )

    case 'not-found':
      return <NotFoundRoute pathname={route.pathname} />

    case 'workspace':
    default:
      return (
        <ErrorBoundary section="the application">
          <WorkspaceRoute />
        </ErrorBoundary>
      )
  }
}
