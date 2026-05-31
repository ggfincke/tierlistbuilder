// src/features/platform/profile/ui/ProfileHeader.tsx
// avatar + identity block atop a public profile; edit affordance when it's you

import { MapPin } from 'lucide-react'

import type { PublicUserProfile } from '@tierlistbuilder/contracts/platform/profile'
import { settingsTabPath } from '~/features/platform/settings/model/settingsTabs'
import { PlanBadge } from '~/features/platform/settings/ui/SettingsChrome'
import { Avatar } from '~/shared/ui/Avatar'
import { ButtonLink } from '~/shared/ui/Button'

interface ProfileHeaderProps
{
  profile: PublicUserProfile
  isSelf: boolean
}

const formatJoined = (createdAt: number): string =>
  new Date(createdAt).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })

export const ProfileHeader = ({ profile, isSelf }: ProfileHeaderProps) =>
{
  const name = profile.displayName ?? `@${profile.handle}`
  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
      <Avatar
        name={name}
        src={profile.avatarUrl}
        size="xl"
        variant={isSelf ? 'gradient' : 'neutral'}
        className="h-20 w-20 text-[26px] sm:h-24 sm:w-24"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-[26px] font-black leading-tight tracking-[-0.02em] text-[var(--t-text)] sm:text-[32px]">
            {name}
          </h1>
          <PlanBadge plan={profile.plan} />
        </div>
        <p className="mono mt-1 text-[13px] text-[var(--t-text-muted)]">
          @{profile.handle}
        </p>
        {profile.bio && (
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-[var(--t-text-secondary)]">
            {profile.bio}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[var(--t-text-faint)]">
          {profile.pronouns && <span>{profile.pronouns}</span>}
          {profile.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" strokeWidth={1.8} aria-hidden />
              {profile.location}
            </span>
          )}
          <span>Joined {formatJoined(profile.createdAt)}</span>
        </div>
      </div>
      {isSelf && (
        <ButtonLink
          to={settingsTabPath('profile')}
          size="sm"
          className="shrink-0 self-start rounded-lg text-[12px] font-bold"
        >
          Edit profile
        </ButtonLink>
      )}
    </header>
  )
}
