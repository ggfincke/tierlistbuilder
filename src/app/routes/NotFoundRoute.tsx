// src/app/routes/NotFoundRoute.tsx
// minimal not-found route — rendered by react-router for unmatched paths

import { useLocation } from 'react-router-dom'

import { getWorkspacePath } from './pathname'

export const NotFoundRoute = () =>
{
  const { pathname } = useLocation()

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--t-bg-page)] px-6 text-[var(--t-text)]">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="mt-3 text-sm text-[var(--t-text-muted)]">
          No route exists for <code>{pathname}</code>.
        </p>
        <a
          href={getWorkspacePath()}
          className="mt-5 inline-flex rounded-md bg-[var(--t-accent)] px-4 py-2 text-sm font-medium text-[var(--t-accent-foreground)]"
        >
          Return to workspace
        </a>
      </div>
    </main>
  )
}
