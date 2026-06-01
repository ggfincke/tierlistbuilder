// src/app/routes/NotFoundRoute.tsx
// minimal not-found route — rendered by react-router for unmatched paths

import { useLocation } from 'react-router-dom'

import { AmbientPageShell } from '~/app/shells/AmbientPageShell'
import { NotFoundSurface } from '~/shared/ui/NotFoundSurface'

export const NotFoundRoute = () =>
{
  const { pathname } = useLocation()

  return (
    <AmbientPageShell>
      <NotFoundSurface
        title="Page not found"
        body="No route exists for"
        code={pathname}
        actionLabel="Return to workspace"
        to="/"
      />
    </AmbientPageShell>
  )
}
