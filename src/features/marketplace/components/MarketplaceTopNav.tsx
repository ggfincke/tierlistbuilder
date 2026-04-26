// src/features/marketplace/components/MarketplaceTopNav.tsx
// top navigation rendered by the marketplace layout — workspace / templates
// links, plus a session-aware sign-in or account chip on the right

import { LogIn } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'

import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { TEMPLATES_ROUTE_PATH } from '~/app/routes/pathname'
import { useSignInPromptStore } from '~/features/marketplace/model/useSignInPromptStore'

const NAV_ITEMS = [
  { id: 'workspace', label: 'Workspace', to: '/' },
  { id: 'templates', label: 'Templates', to: TEMPLATES_ROUTE_PATH },
] as const

export const MarketplaceTopNav = () =>
{
  const session = useAuthSession()
  const showSignIn = useSignInPromptStore((s) => s.show)

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
      : null

  return (
    <header className="relative z-20 mx-auto flex w-full max-w-[1240px] items-center justify-between gap-4 px-5 pt-5 sm:px-8">
      <Link
        to="/"
        className="focus-custom inline-flex items-center gap-2 rounded-full border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-3 py-1.5 text-xs font-semibold tracking-tight text-[var(--t-text)] transition hover:border-[var(--t-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
        aria-label="TierListBuilder home"
      >
        <span
          aria-hidden="true"
          className="flex h-4 w-4 flex-col justify-center gap-0.5"
        >
          <span className="block h-0.5 w-full rounded-full bg-current" />
          <span className="block h-0.5 w-3/4 rounded-full bg-current" />
          <span className="block h-0.5 w-1/2 rounded-full bg-current" />
        </span>
        <span>TierListBuilder</span>
      </Link>

      <nav aria-label="Marketplace" className="flex items-center gap-1.5">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.id}
            to={item.to}
            end={item.id === 'workspace'}
            className={({ isActive }) =>
              `focus-custom rounded-full px-3 py-1.5 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] ${
                isActive
                  ? 'bg-[rgb(var(--t-overlay)/0.08)] text-[var(--t-text)]'
                  : 'text-[var(--t-text-muted)] hover:bg-[rgb(var(--t-overlay)/0.04)] hover:text-[var(--t-text-secondary)]'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}

        <span
          aria-hidden="true"
          className="mx-1 hidden h-5 w-px bg-[var(--t-border)] sm:inline-block"
        />

        {session.status === 'signed-in' ? (
          <Link
            to="/"
            aria-label={`Account: ${session.user.displayName ?? session.user.email ?? 'signed in'}`}
            className="focus-custom flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-[var(--t-border)] bg-[var(--t-bg-surface)] text-xs font-semibold text-[var(--t-text)] transition hover:border-[var(--t-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
          >
            {session.user.image ? (
              <img
                src={session.user.image}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              initial
            )}
          </Link>
        ) : (
          <button
            type="button"
            onClick={showSignIn}
            disabled={session.status === 'loading'}
            className="focus-custom inline-flex items-center gap-1.5 rounded-full border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--t-text)] transition hover:border-[var(--t-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogIn className="h-3 w-3" strokeWidth={2} />
            Sign in
          </button>
        )}
      </nav>
    </header>
  )
}
