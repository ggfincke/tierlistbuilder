// src/features/platform/profile/pages/ProfilePage.tsx
// public profile route entry

import { useQuery } from 'convex/react'

import { api } from '@convex/_generated/api'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { useDocumentTitle } from '~/shared/hooks/useDocumentTitle'
import { PAGE_TOP_LEVEL } from '~/shared/ui/pageContainer'
import { AuthoredTemplates } from '../ui/AuthoredTemplates'
import { ProfileHeader } from '../ui/ProfileHeader'
import { ProfileShowcaseView } from '../ui/ProfileShowcaseView'
import { ProfileNotFound, ProfileSkeleton } from '../ui/ProfileStates'

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
      <section className={PAGE_TOP_LEVEL}>
        <ProfileNotFound />
      </section>
    )
  }
  if (profile === undefined)
  {
    return (
      <section className={PAGE_TOP_LEVEL}>
        <ProfileSkeleton />
      </section>
    )
  }

  const isSelf =
    session.status === 'signed-in' && session.user._id === profile.id

  return (
    <section className={PAGE_TOP_LEVEL}>
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
