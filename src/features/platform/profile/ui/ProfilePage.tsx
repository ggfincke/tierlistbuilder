// src/features/platform/profile/ui/ProfilePage.tsx
// public profile placeholder for the extracted UI shell

import { useDocumentTitle } from '~/shared/hooks/useDocumentTitle'
import { ProfileNotFound } from './ProfileStates'

const PAGE_CLASS =
  'relative z-10 mx-auto w-full max-w-[1320px] px-6 pb-24 pt-20 sm:px-10 sm:pt-24'

interface ProfilePageProps
{
  handle: string
}

export const ProfilePage = ({ handle }: ProfilePageProps) =>
{
  useDocumentTitle(handle ? `@${handle}` : 'Profile')

  return (
    <section className={PAGE_CLASS}>
      <ProfileNotFound />
    </section>
  )
}
