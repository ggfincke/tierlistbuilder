// src/features/platform/profile/ui/ProfilePage.tsx
// public profile — identity header + tlotl showcase + authored templates

import { useQuery } from 'convex/react'

import { api } from '@convex/_generated/api'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { useDocumentTitle } from '~/shared/hooks/useDocumentTitle'
import { AuthoredTemplates } from './AuthoredTemplates'
import { ProfileHeader } from './ProfileHeader'
import { ProfileShowcaseView } from './ProfileShowcaseView'
import { ProfileNotFound, ProfileSkeleton } from './ProfileStates'

const PAGE_CLASS =
  'relative z-10 mx-auto w-full max-w-[1320px] px-6 pb-24 pt-20 sm:px-10 sm:pt-24'

interface ProfilePageProps
{
  handle: string
}

export const ProfilePage = ({ handle }: ProfilePageProps) =>
{
  const profile = useQuery(
    api.platform.profile.getPublicProfileByHandle,
    handle ? { handle } : 'skip'
  )
  const session = useAuthSession()

  useDocumentTitle(
    profile ? `@${profile.handle}` : handle ? `@${handle}` : 'Profile'
  )

  if (!handle || profile === null)
  {
    return (
      <section className={PAGE_CLASS}>
        <ProfileNotFound />
      </section>
    )
  }
  if (profile === undefined)
  {
    return (
      <section className={PAGE_CLASS}>
        <ProfileSkeleton />
      </section>
    )
  }

  const isSelf =
    session.status === 'signed-in' && session.user._id === profile.id

  return (
    <section className={PAGE_CLASS}>
      <ProfileHeader profile={profile} isSelf={isSelf} />
      <ProfileShowcaseView showcase={profile.showcase} isSelf={isSelf} />
      <div className="mt-12">
        <AuthoredTemplates
          templates={profile.templates}
          hasMore={profile.hasMoreTemplates}
          displayName={profile.displayName ?? `@${profile.handle}`}
          isSelf={isSelf}
        />
      </div>
    </section>
  )
}
