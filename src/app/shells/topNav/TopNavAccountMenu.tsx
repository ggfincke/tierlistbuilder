// src/app/shells/topNav/TopNavAccountMenu.tsx
// avatar dropdown menu — profile header + settings + preferences + auth
// (My Boards lives in the top nav tabs, so it's omitted here)

import {
  LogIn,
  LogOut,
  Settings,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import type { AuthSession } from '~/features/platform/auth/model/useAuthSession'
import { getDisplayName } from '~/features/platform/auth/model/userIdentity'
import { settingsTabPath } from '~/features/platform/settings/model/settingsTabs'
import { getProfilePath } from '~/shared/routes/pathname'
import { Avatar } from '~/shared/ui/Avatar'
import {
  OverlayDivider,
  OverlayMenuItem,
  OverlayMenuSurface,
} from '~/shared/overlay/OverlaySurface'

type SignedInSession = Extract<AuthSession, { status: 'signed-in' }>

interface TopNavAccountMenuProps
{
  session: AuthSession
  onClose: () => void
  menuId: string
  onOpenSettings: () => void
  onOpenPreferences: () => void
  onOpenSignIn: () => void
  onSignOut: () => void
}

interface MenuEntry
{
  icon: LucideIcon
  label: string
  onSelect: () => void
  shortcut?: string
}

// name + avatar atop the menu, linking to the user's public profile (or to
// Settings -> Profile to claim a handle first when none is set)
const ProfileMenuHeader = ({
  user,
  onClose,
}: {
  user: SignedInSession['user']
  onClose: () => void
}) =>
{
  const name = getDisplayName(user, 'Account', { email: 'local' })
  const to = user.handle
    ? getProfilePath(user.handle)
    : settingsTabPath('profile')
  return (
    <Link
      to={to}
      onClick={onClose}
      className="focus-custom flex items-center gap-2.5 rounded-md px-2.5 py-2 transition hover:bg-[rgb(var(--t-overlay)/0.05)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
    >
      <Avatar name={name} src={user.image} size="sm" variant="gradient" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold text-[var(--t-text)]">
          {name}
        </span>
        <span className="mono block truncate text-[11px] text-[var(--t-text-faint)]">
          {user.handle ? `@${user.handle}` : 'Set up your profile'}
        </span>
      </span>
    </Link>
  )
}

export const TopNavAccountMenu = ({
  session,
  onClose,
  menuId,
  onOpenSettings,
  onOpenPreferences,
  onOpenSignIn,
  onSignOut,
}: TopNavAccountMenuProps) =>
{
  const signedIn = session.status === 'signed-in'
  const entries: MenuEntry[] = [
    signedIn
      ? { icon: Settings, label: 'Settings', onSelect: onOpenSettings }
      : { icon: LogIn, label: 'Sign in', onSelect: onOpenSignIn },
    {
      icon: SlidersHorizontal,
      label: 'Preferences',
      onSelect: onOpenPreferences,
      shortcut: '⌘,',
    },
    ...(signedIn
      ? [{ icon: LogOut, label: 'Sign out', onSelect: onSignOut }]
      : []),
  ]

  return (
    <OverlayMenuSurface
      id={menuId}
      role="menu"
      aria-label="Account menu"
      className="absolute right-0 top-[calc(100%+8px)] w-60 origin-top-right overflow-hidden p-0"
    >
      {session.status === 'signed-in' && (
        <div className="px-1.5 pt-1.5">
          <ProfileMenuHeader user={session.user} onClose={onClose} />
          <OverlayDivider />
        </div>
      )}
      <ul role="none" className="flex flex-col px-1.5 pb-2 pt-1">
        {entries.map((entry) => (
          <li role="none" key={entry.label}>
            <OverlayMenuItem
              role="menuitem"
              density="compact"
              onClick={() =>
              {
                entry.onSelect()
                onClose()
              }}
            >
              <entry.icon className="h-3.5 w-3.5" strokeWidth={1.8} />
              {entry.label}
              {entry.shortcut && (
                <span className="ml-auto text-[10px] text-[var(--t-text-faint)]">
                  {entry.shortcut}
                </span>
              )}
            </OverlayMenuItem>
          </li>
        ))}
      </ul>
    </OverlayMenuSurface>
  )
}
