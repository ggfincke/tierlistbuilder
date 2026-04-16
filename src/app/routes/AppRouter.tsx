// src/app/routes/AppRouter.tsx
// app-level router that selects the workspace, embed, or not-found route

import { useSyncExternalStore } from 'react'

import { ErrorBoundary } from '~/shared/ui/ErrorBoundary'
import { EmbedRoute } from './EmbedRoute'
import { NotFoundRoute } from './NotFoundRoute'
import { resolveAppRoute } from './pathname'
import { WorkspaceRoute } from './WorkspaceRoute'

const subscribeToLocation = (onChange: () => void): (() => void) =>
{
  window.addEventListener('popstate', onChange)
  return () => window.removeEventListener('popstate', onChange)
}

const getLocationPathname = (): string => window.location.pathname

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
          <EmbedRoute />
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
