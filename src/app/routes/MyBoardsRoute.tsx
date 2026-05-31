// src/app/routes/MyBoardsRoute.tsx
// /boards route — wraps the local library page shell

import { useAppReady } from '~/app/bootstrap/useAppBootstrap'
import { MyBoardsPage } from '~/features/library/pages/MyBoardsPage'
import { AmbientPageShell } from '~/shared/ui/AmbientPageShell'

export const MyBoardsRoute = () =>
{
  const appReady = useAppReady()

  return (
    <AmbientPageShell ready={appReady}>
      <MyBoardsPage />
    </AmbientPageShell>
  )
}
