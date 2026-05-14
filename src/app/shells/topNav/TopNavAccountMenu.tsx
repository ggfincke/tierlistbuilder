// src/app/shells/topNav/TopNavAccountMenu.tsx
// avatar dropdown menu for auth, account, library, & preferences

import {
  Bookmark,
  LogIn,
  LogOut,
  Settings,
  User,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import type { AuthSession } from '~/features/platform/auth/model/useAuthSession'
import { OverlayMenuSurface } from '~/shared/overlay/OverlaySurface'
import { BOARDS_ROUTE_PATH } from '~/shared/routes/pathname'

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

const MENU_ITEM_CLASS =
  'focus-custom flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[12px] text-[var(--t-text-secondary)] transition hover:bg-[rgb(var(--t-overlay)/0.05)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]'

type MenuEntry =
  | { kind: 'action'; icon: LucideIcon; label: string; onSelect: () => void }
  | { kind: 'link'; icon: LucideIcon; label: string; to: string }

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
      ? {
          kind: 'action',
          icon: User,
          label: 'Account',
          onSelect: onOpenAccount,
        }
      : {
          kind: 'action',
          icon: LogIn,
          label: 'Sign in',
          onSelect: onOpenSignIn,
        },
    {
      kind: 'link',
      icon: Bookmark,
      label: 'My Boards',
      to: BOARDS_ROUTE_PATH,
    },
    {
      kind: 'action',
      icon: Settings,
      label: 'Preferences',
      onSelect: onOpenPreferences,
    },
    ...(signedIn
      ? [
          {
            kind: 'action' as const,
            icon: LogOut,
            label: 'Sign out',
            onSelect: onSignOut,
          },
        ]
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
            {entry.kind === 'link' ? (
              <Link
                role="menuitem"
                to={entry.to}
                onClick={onClose}
                className={MENU_ITEM_CLASS}
              >
                <entry.icon className="h-3.5 w-3.5" strokeWidth={1.8} />
                {entry.label}
              </Link>
            ) : (
              <button
                role="menuitem"
                type="button"
                onClick={() =>
                  {
                  entry.onSelect()
                  onClose()
                }}
                className={MENU_ITEM_CLASS}
              >
                <entry.icon className="h-3.5 w-3.5" strokeWidth={1.8} />
                {entry.label}
              </button>
            )}
          </li>
        ))}
      </ul>
    </OverlayMenuSurface>
  )
}
