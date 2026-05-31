// src/features/platform/settings/ui/ProfilePanel.tsx
// Profile tab — identity editor beside the live "how others see you" preview

import type { PublicUserMe } from '@tierlistbuilder/contracts/platform/user'
import type { ProfileDraftController } from '~/features/platform/auth/model/useProfileDraft'
import { SettingsTabLayout } from '~/shared/ui/settings/SettingsChrome'
import { IdentitySection } from './IdentitySection'
import { ProfilePreviewCard } from './ProfilePreviewCard'

interface ProfilePanelProps
{
  user: PublicUserMe
  profile: ProfileDraftController
}

export const ProfilePanel = ({ user, profile }: ProfilePanelProps) => (
  <SettingsTabLayout
    main={<IdentitySection profile={profile} />}
    aside={<ProfilePreviewCard user={user} draft={profile.draft} />}
  />
)
