// src/app/shells/topNav/TopNavAccountMenu.tsx
// avatar dropdown menu for account, library, preferences, & auth actions

import { ListChecks, LogIn, LogOut, Settings, UserCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { BOARDS_ROUTE_PATH } from '~/shared/routes/pathname'

interface TopNavAccountMenuProps
{
  onClose: () => void
  menuId: string
  signedIn: boolean
  signedInLabel: string | null
  signedInEmail: string | null
  onSignIn: () => void
  onSignOut: () => void
  onOpenAccount: () => void
  onOpenPreferences: () => void
}

const MENU_ITEM_CLASS =
  'focus-custom flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[12px] text-[var(--t-text-secondary)] transition hover:bg-[rgb(var(--t-overlay)/0.05)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]'

export const TopNavAccountMenu = ({
  onClose,
  menuId,
  signedIn,
  signedInLabel,
  signedInEmail,
  onSignIn,
  onSignOut,
  onOpenAccount,
  onOpenPreferences,
}: TopNavAccountMenuProps) => (
  <div
    id={menuId}
    role="menu"
    aria-label="Account menu"
    className="absolute right-0 top-[calc(100%+8px)] w-60 origin-top-right overflow-hidden rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface)] shadow-2xl"
  >
    {signedIn && signedInLabel && (
      <div className="border-b border-[var(--t-border)] px-3 py-3">
        <p className="text-[12px] font-semibold text-[var(--t-text)]">
          {signedInLabel}
        </p>
        {signedInEmail && (
          <p className="mt-0.5 truncate text-[11px] text-[var(--t-text-faint)]">
            {signedInEmail}
          </p>
        )}
      </div>
    )}

    <ul role="none" className="flex flex-col px-1.5 py-2">
      {signedIn && (
        <>
          <li role="none">
            <button
              role="menuitem"
              type="button"
              onClick={() =>
              {
                onOpenAccount()
                onClose()
              }}
              className={MENU_ITEM_CLASS}
            >
              <UserCircle2 className="h-3.5 w-3.5" strokeWidth={1.8} />
              Account
            </button>
          </li>
          <li role="none">
            <Link
              role="menuitem"
              to={BOARDS_ROUTE_PATH}
              onClick={onClose}
              className={MENU_ITEM_CLASS}
            >
              <ListChecks className="h-3.5 w-3.5" strokeWidth={1.8} />
              My lists
            </Link>
          </li>
          <MenuDivider />
        </>
      )}

      <li role="none">
        <button
          role="menuitem"
          type="button"
          onClick={() =>
          {
            onOpenPreferences()
            onClose()
          }}
          className={MENU_ITEM_CLASS}
        >
          <Settings className="h-3.5 w-3.5" strokeWidth={1.8} />
          Preferences
        </button>
      </li>

      <MenuDivider />

      {signedIn ? (
        <li role="none">
          <button
            role="menuitem"
            type="button"
            onClick={() =>
              {
              onSignOut()
              onClose()
            }}
            className={MENU_ITEM_CLASS}
          >
            <LogOut className="h-3.5 w-3.5" strokeWidth={1.8} />
            Sign out
          </button>
        </li>
      ) : (
        <li role="none">
          <button
            role="menuitem"
            type="button"
            onClick={() =>
              {
              onSignIn()
              onClose()
            }}
            className={MENU_ITEM_CLASS}
          >
            <LogIn className="h-3.5 w-3.5" strokeWidth={1.8} />
            Sign in
          </button>
        </li>
      )}
    </ul>
  </div>
)

const MenuDivider = () => (
  <li role="none" aria-hidden="true">
    <div className="my-1 h-px bg-[var(--t-border)]" />
  </li>
)
