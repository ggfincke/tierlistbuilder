// src/app/routes/ProfileRoute.tsx
// /u/:handle route — public profile shell

import { useParams } from 'react-router-dom'

import { ProfilePage } from '~/features/platform/profile/pages/ProfilePage'
import { AmbientPageShell } from '~/app/shells/AmbientPageShell'

export const ProfileRoute = () =>
{
  const { handle } = useParams<{ handle: string }>()

  return (
    <AmbientPageShell>
      <ProfilePage handle={handle ?? ''} />
    </AmbientPageShell>
  )
}
