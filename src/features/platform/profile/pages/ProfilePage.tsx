// src/features/platform/profile/pages/ProfilePage.tsx
// public profile route entry

import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { usePublicProfile } from '~/features/platform/profile/model/usePublicProfile'
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
  const profileState = usePublicProfile(handle)
  const session = useAuthSession()
  const profile = profileState.status === 'ready' ? profileState.profile : null

  useDocumentTitle(
    profile ? `@${profile.handle}` : handle ? `@${handle}` : 'Profile'
  )

  if (profileState.status === 'not-found')
  {
    return (
      <section className={PAGE_TOP_LEVEL}>
        <ProfileNotFound />
      </section>
    )
  }
  if (profileState.status === 'loading')
  {
    return (
      <section className={PAGE_TOP_LEVEL}>
        <ProfileSkeleton />
      </section>
    )
  }

  const { profile: readyProfile } = profileState
  const isSelf =
    session.status === 'signed-in' && session.user._id === readyProfile.id

  return (
    <section className={PAGE_TOP_LEVEL}>
      <ProfileHeader profile={readyProfile} isSelf={isSelf} />
      <ProfileShowcaseView showcase={readyProfile.showcase} isSelf={isSelf} />
      <div className="mt-12">
        <AuthoredTemplates
          templates={readyProfile.templates}
          hasMore={readyProfile.hasMoreTemplates}
          displayName={readyProfile.displayName ?? `@${readyProfile.handle}`}
          isSelf={isSelf}
        />
      </div>
    </section>
  )
}
