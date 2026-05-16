// src/app/shells/topNav/TopNavAccountMenu.tsx
// avatar dropdown menu — auth + account + preferences (My Boards lives
// in the top nav tabs, so it's omitted here to avoid duplication)

import { LogIn, LogOut, Settings, User, type LucideIcon } from 'lucide-react'

import type { AuthSession } from '~/features/platform/auth/model/useAuthSession'
import {
  OverlayMenuItem,
  OverlayMenuSurface,
} from '~/shared/overlay/OverlaySurface'

interface TopNavAccountMenuProps
{
  session: AuthSession
  onClose: () => void
  menuId: string
  onOpenAccount: () => void
  onOpenPreferences: () => void
  onOpenSignIn: () => void
  onSignOut: () => void
}

interface MenuEntry
{
  icon: LucideIcon
  label: string
  onSelect: () => void
}

export const TopNavAccountMenu = ({
  session,
  onClose,
  menuId,
  onOpenAccount,
  onOpenPreferences,
  onOpenSignIn,
  onSignOut,
}: TopNavAccountMenuProps) =>
{
  const signedIn = session.status === 'signed-in'
  const entries: MenuEntry[] = [
    signedIn
      ? { icon: User, label: 'Account', onSelect: onOpenAccount }
      : { icon: LogIn, label: 'Sign in', onSelect: onOpenSignIn },
    { icon: Settings, label: 'Preferences', onSelect: onOpenPreferences },
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
      <ul role="none" className="flex flex-col px-1.5 py-2">
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
            </OverlayMenuItem>
          </li>
        ))}
      </ul>
    </OverlayMenuSurface>
  )
}
