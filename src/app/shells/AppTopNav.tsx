// src/app/shells/AppTopNav.tsx
// shared corner-floating nav: wordmark capsule on the left, surface pills +
// avatar on the right. avatar doubles as a global-menu trigger when signed in

import {
  Layers,
  Library,
  ListChecks,
  LogIn,
  LogOut,
  Settings,
  User,
  UserCircle2,
} from 'lucide-react'
import {
  useCallback,
  useId,
  lazy,
  useRef,
  useState,
  type ComponentType,
  type SVGProps,
} from 'react'
import { Link, NavLink } from 'react-router-dom'

import { useAuthActions } from '~/features/platform/auth/model/useAuthActions'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import {
  getDisplayName,
  getUserInitial,
} from '~/features/platform/auth/model/userIdentity'
import { SignInModal } from '~/features/platform/auth/ui/SignInModal'
import { useSignInPromptStore } from '~/features/marketplace/model/useSignInPromptStore'
import { BOARDS_ROUTE_PATH, TEMPLATES_ROUTE_PATH } from '~/app/routes/pathname'
import { useDismissibleLayer } from '~/shared/overlay/dismissibleLayer'
import { LazyModalSlot } from '~/shared/overlay/LazyModalSlot'

type IconCmp = ComponentType<SVGProps<SVGSVGElement>>

const PreferencesModal = lazy(() =>
  import('~/features/platform/preferences/ui/PreferencesModal').then(
    (module) => ({
      default: module.PreferencesModal,
    })
  )
)

const AccountModal = lazy(() =>
  import('~/features/platform/auth/ui/AccountModal').then((module) => ({
    default: module.AccountModal,
  }))
)

interface NavItem
{
  id: 'workspace' | 'templates'
  label: string
  to: string
  icon: IconCmp
  end: boolean
}

// "My lists" lives in the avatar menu — it's user-scoped, not a peer surface.
// keeping the pill row to public/shared surfaces
const NAV_ITEMS: readonly NavItem[] = [
  { id: 'workspace', label: 'Workspace', to: '/', icon: Layers, end: true },
  {
    id: 'templates',
    label: 'Templates',
    to: TEMPLATES_ROUTE_PATH,
    icon: Library,
    end: false,
  },
]

const BrandCapsule = () => (
  <Link
    to="/"
    aria-label="TierListBuilder home"
    className="focus-custom pointer-events-auto inline-flex items-center rounded-full border border-[var(--t-border)] bg-[var(--t-bg-surface)]/85 px-4 py-1.5 text-[12px] font-semibold tracking-tight text-[var(--t-text)] backdrop-blur transition hover:border-[var(--t-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
  >
    TierListBuilder
  </Link>
)

const MENU_ITEM_CLASS =
  'focus-custom flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[12px] text-[var(--t-text-secondary)] transition hover:bg-[rgb(var(--t-overlay)/0.05)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]'

const MENU_DIVIDER = (
  <li role="none" aria-hidden="true">
    <div className="my-1 h-px bg-[var(--t-border)]" />
  </li>
)

interface GlobalMenuProps
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

const GlobalMenu = ({
  onClose,
  menuId,
  signedIn,
  signedInLabel,
  signedInEmail,
  onSignIn,
  onSignOut,
  onOpenAccount,
  onOpenPreferences,
}: GlobalMenuProps) => (
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

          {MENU_DIVIDER}
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

      {MENU_DIVIDER}

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

const AvatarButton = ({
  initial,
  imageUrl,
  label,
  menuOpen,
  menuId,
  onToggle,
  loading,
}: {
  initial: string | null
  imageUrl: string | null
  label: string
  menuOpen: boolean
  menuId: string
  onToggle: () => void
  loading?: boolean
}) => (
  <button
    type="button"
    aria-label={label}
    aria-expanded={menuOpen}
    aria-controls={menuId}
    onClick={onToggle}
    disabled={loading}
    className="focus-custom flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-[var(--t-border)] bg-[var(--t-bg-page)] text-[11px] font-semibold text-[var(--t-text)] transition hover:border-[var(--t-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] disabled:cursor-not-allowed disabled:opacity-60"
  >
    {imageUrl ? (
      <img
        src={imageUrl}
        alt=""
        className="h-full w-full object-cover"
        draggable={false}
      />
    ) : initial ? (
      initial
    ) : (
      <User
        className="h-4 w-4 text-[var(--t-text-muted)]"
        strokeWidth={1.8}
        aria-hidden
      />
    )}
  </button>
)

const SurfacePill = ({ item }: { item: NavItem }) => (
  <NavLink
    to={item.to}
    end={item.end}
    aria-label={item.label}
    className={({ isActive }) =>
      [
        'focus-custom inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-medium transition focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] sm:px-3',
        isActive
          ? 'bg-[var(--t-text)] text-[var(--t-bg-page)] shadow-sm'
          : 'text-[var(--t-text-muted)] hover:text-[var(--t-text)]',
      ].join(' ')
    }
  >
    <item.icon className="h-3.5 w-3.5" strokeWidth={1.8} />
    <span className="hidden sm:inline">{item.label}</span>
  </NavLink>
)

export const AppTopNav = () =>
{
  const session = useAuthSession()
  const { signOut } = useAuthActions()
  const showSignIn = useSignInPromptStore((s) => s.show)
  const signInOpen = useSignInPromptStore((s) => s.open)
  const hideSignIn = useSignInPromptStore((s) => s.hide)
  const [menuOpen, setMenuOpen] = useState(false)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const menuId = useId()
  const accountWrapRef = useRef<HTMLDivElement>(null)

  const closeMenu = useCallback(() =>
  {
    setMenuOpen(false)
  }, [])

  useDismissibleLayer({
    open: menuOpen,
    layerRef: accountWrapRef,
    onDismiss: closeMenu,
  })

  const signedInLabel =
    session.status === 'signed-in'
      ? getDisplayName(session.user, 'Signed in', { email: 'omit' })
      : null
  const signedInEmail =
    session.status === 'signed-in' ? (session.user.email ?? null) : null
  const initial =
    session.status === 'signed-in' ? getUserInitial(session.user) : null
  const isSignedIn = session.status === 'signed-in'
  const isLoading = session.status === 'loading'

  const handleSignOut = useCallback(() =>
  {
    void signOut()
  }, [signOut])

  return (
    <>
      <header
        aria-label="Primary navigation"
        className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5"
      >
        <BrandCapsule />

        <nav
          aria-label="Surfaces"
          className="pointer-events-auto flex items-center gap-1 rounded-full border border-[var(--t-border)] bg-[var(--t-bg-surface)]/65 p-1 backdrop-blur sm:gap-1.5"
        >
          {NAV_ITEMS.map((item) => (
            <SurfacePill key={item.id} item={item} />
          ))}
          <span
            aria-hidden="true"
            className="mx-0.5 h-5 w-px bg-[var(--t-border)] sm:mx-1"
          />
          <div ref={accountWrapRef} className="relative">
            <AvatarButton
              initial={initial}
              imageUrl={isSignedIn ? (session.user.image ?? null) : null}
              label={
                isSignedIn
                  ? `Account: ${signedInLabel ?? 'signed in'}`
                  : 'Open account menu'
              }
              menuOpen={menuOpen}
              menuId={menuId}
              onToggle={() => setMenuOpen((v) => !v)}
              loading={isLoading}
            />
            {menuOpen && (
              <GlobalMenu
                onClose={closeMenu}
                menuId={menuId}
                signedIn={isSignedIn}
                signedInLabel={signedInLabel}
                signedInEmail={signedInEmail}
                onSignIn={showSignIn}
                onSignOut={handleSignOut}
                onOpenAccount={() => setAccountOpen(true)}
                onOpenPreferences={() => setPreferencesOpen(true)}
              />
            )}
          </div>
        </nav>
      </header>
      <SignInModal open={signInOpen} onClose={hideSignIn} />
      <LazyModalSlot when={preferencesOpen} section="preferences">
        {() => (
          <PreferencesModal open onClose={() => setPreferencesOpen(false)} />
        )}
      </LazyModalSlot>
      <LazyModalSlot when={accountOpen} section="account">
        {() => <AccountModal open onClose={() => setAccountOpen(false)} />}
      </LazyModalSlot>
    </>
  )
}
