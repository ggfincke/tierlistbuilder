// src/app/shells/AppTopNav.tsx
// shared corner-floating nav: wordmark capsule on the left, surface pills +
// avatar on the right. avatar doubles as a global-menu trigger when signed in

import {
  Github,
  Layers,
  Library,
  ListChecks,
  LogIn,
  LogOut,
} from 'lucide-react'
import {
  useCallback,
  useId,
  useRef,
  useState,
  type ComponentType,
  type SVGProps,
} from 'react'
import { Link, NavLink } from 'react-router-dom'

import { useAuthActions } from '~/features/platform/auth/model/useAuthActions'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { SignInModal } from '~/features/platform/auth/ui/SignInModal'
import { useSignInPromptStore } from '~/features/marketplace/model/useSignInPromptStore'
import { BOARDS_ROUTE_PATH, TEMPLATES_ROUTE_PATH } from '~/app/routes/pathname'
import { GITHUB_REPO_URL } from '~/shared/lib/urls'
import { useDismissibleLayer } from '~/shared/overlay/dismissibleLayer'

type IconCmp = ComponentType<SVGProps<SVGSVGElement>>

interface NavItem
{
  id: 'workspace' | 'boards' | 'templates'
  label: string
  to: string
  icon: IconCmp
  end: boolean
}

const NAV_ITEMS: readonly NavItem[] = [
  { id: 'workspace', label: 'Workspace', to: '/', icon: Layers, end: true },
  {
    id: 'boards',
    label: 'My lists',
    to: BOARDS_ROUTE_PATH,
    icon: ListChecks,
    end: false,
  },
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
    className="focus-custom inline-flex items-center rounded-full border border-[var(--t-border)] bg-[var(--t-bg-surface)]/85 px-4 py-1.5 text-[12px] font-semibold tracking-tight text-[var(--t-text)] backdrop-blur transition hover:border-[var(--t-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
  >
    TierListBuilder
  </Link>
)

const GlobalMenu = ({
  onClose,
  menuId,
  signedInLabel,
  signedInEmail,
  onSignOut,
}: {
  onClose: () => void
  menuId: string
  signedInLabel: string
  signedInEmail: string | null
  onSignOut: () => void
}) => (
  <div
    id={menuId}
    role="menu"
    aria-label="Account menu"
    className="absolute right-0 top-[calc(100%+8px)] w-60 origin-top-right overflow-hidden rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface)] shadow-2xl"
  >
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

    <ul role="none" className="flex flex-col px-1.5 py-2">
      <li role="none">
        <a
          role="menuitem"
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
          className="focus-custom flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[12px] text-[var(--t-text-secondary)] transition hover:bg-[rgb(var(--t-overlay)/0.05)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
        >
          <Github className="h-3.5 w-3.5" strokeWidth={1.8} />
          GitHub
        </a>
      </li>
      <li role="none">
        <button
          role="menuitem"
          type="button"
          onClick={() =>
          {
            onSignOut()
            onClose()
          }}
          className="focus-custom flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[12px] text-[var(--t-text-secondary)] transition hover:bg-[rgb(var(--t-overlay)/0.05)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
        >
          <LogOut className="h-3.5 w-3.5" strokeWidth={1.8} />
          Sign out
        </button>
      </li>
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
}: {
  initial: string
  imageUrl: string | null
  label: string
  menuOpen: boolean
  menuId: string
  onToggle: () => void
}) => (
  <button
    type="button"
    aria-label={label}
    aria-expanded={menuOpen}
    aria-controls={menuId}
    onClick={onToggle}
    className="focus-custom flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-[var(--t-border)] bg-[var(--t-bg-page)] text-[11px] font-semibold text-[var(--t-text)] transition hover:border-[var(--t-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
  >
    {imageUrl ? (
      <img
        src={imageUrl}
        alt=""
        className="h-full w-full object-cover"
        draggable={false}
      />
    ) : (
      initial
    )}
  </button>
)

const SignInPill = ({
  onClick,
  loading,
}: {
  onClick: () => void
  loading: boolean
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={loading}
    className="focus-custom inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium text-[var(--t-text-secondary)] transition hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] disabled:cursor-not-allowed disabled:opacity-60"
  >
    <LogIn className="h-3.5 w-3.5" strokeWidth={1.8} />
    Sign in
  </button>
)

const SurfacePill = ({ item }: { item: NavItem }) => (
  <NavLink
    to={item.to}
    end={item.end}
    className={({ isActive }) =>
      [
        'focus-custom inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]',
        isActive
          ? 'bg-[var(--t-text)] text-[var(--t-bg-page)] shadow-sm'
          : 'text-[var(--t-text-muted)] hover:text-[var(--t-text)]',
      ].join(' ')
    }
  >
    <item.icon className="h-3.5 w-3.5" strokeWidth={1.8} />
    {item.label}
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
      ? (session.user.displayName ?? session.user.name ?? 'Signed in')
      : null
  const signedInEmail =
    session.status === 'signed-in' ? (session.user.email ?? null) : null
  const initial =
    session.status === 'signed-in'
      ? (
          session.user.displayName ??
          session.user.name ??
          session.user.email ??
          'U'
        )
          .slice(0, 1)
          .toUpperCase()
      : 'U'

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
        <div className="pointer-events-auto">
          <BrandCapsule />
        </div>

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
          {session.status === 'signed-in' ? (
            <div ref={accountWrapRef} className="relative">
              <AvatarButton
                initial={initial}
                imageUrl={session.user.image ?? null}
                label={`Account: ${signedInLabel ?? 'signed in'}`}
                menuOpen={menuOpen}
                menuId={menuId}
                onToggle={() => setMenuOpen((v) => !v)}
              />
              {menuOpen && signedInLabel && (
                <GlobalMenu
                  onClose={closeMenu}
                  menuId={menuId}
                  signedInLabel={signedInLabel}
                  signedInEmail={signedInEmail}
                  onSignOut={handleSignOut}
                />
              )}
            </div>
          ) : (
            <SignInPill
              onClick={showSignIn}
              loading={session.status === 'loading'}
            />
          )}
        </nav>
      </header>
      <SignInModal open={signInOpen} onClose={hideSignIn} />
    </>
  )
}
