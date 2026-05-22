// src/features/marketplace/ui/account/accountBadges.tsx
// shared chrome for the account marketplace management lists

import type { ComponentType, ReactNode, SVGProps } from 'react'
import { Link } from 'react-router-dom'

import type { RankingVisibility } from '@tierlistbuilder/contracts/marketplace/ranking'
import type {
  MarketplaceTemplateManagementItem,
  TemplateVisibility,
} from '@tierlistbuilder/contracts/marketplace/template'

import { formatCount } from '~/shared/catalog/formatters'

type Visibility = TemplateVisibility | RankingVisibility

export const ACCOUNT_ICON_BUTTON_CLASS =
  'focus-custom inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--t-border)] text-[var(--t-text-muted)] transition hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]'

interface AccountIconLinkProps
{
  to: string
  ariaLabel: string
  title: string
  children: ReactNode
}

export const AccountIconLink = ({
  to,
  ariaLabel,
  title,
  children,
}: AccountIconLinkProps) => (
  <Link
    to={to}
    aria-label={ariaLabel}
    title={title}
    className={ACCOUNT_ICON_BUTTON_CLASS}
  >
    {children}
  </Link>
)

const FaintBadge = ({ label }: { label: string }) => (
  <span className="rounded-full border border-[var(--t-border)] bg-[var(--t-bg-page)] px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--t-text-faint)]">
    {label}
  </span>
)

interface AccountVisibilityBadgeProps
{
  visibility: Visibility
  publicationState?: MarketplaceTemplateManagementItem['publicationState']
}

export const AccountVisibilityBadge = ({
  visibility,
  publicationState,
}: AccountVisibilityBadgeProps) =>
{
  if (publicationState === 'publishPending')
    return <FaintBadge label="Publishing" />
  if (publicationState === 'publishFailed') return <FaintBadge label="Failed" />
  if (publicationState === 'unpublished')
    return <FaintBadge label="Unpublished" />
  if (visibility === 'unlisted') return <FaintBadge label="Unlisted" />
  return (
    <span className="rounded-full bg-[rgb(var(--t-overlay)/0.06)] px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--t-text-secondary)]">
      Public
    </span>
  )
}

interface AccountRowProps
{
  title: string
  badges: ReactNode
  meta: ReactNode
  stats: ReactNode
  actions: ReactNode
}

export const AccountRow = ({
  title,
  badges,
  meta,
  stats,
  actions,
}: AccountRowProps) => (
  <div className="flex flex-col gap-2 rounded-md border border-[var(--t-border)] bg-[var(--t-bg-surface)] p-3 sm:flex-row sm:items-center sm:gap-4">
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="truncate text-sm font-semibold text-[var(--t-text)]">
          {title}
        </span>
        {badges}
      </div>
      <p className="mt-0.5 text-[11px] text-[var(--t-text-faint)]">{meta}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-[var(--t-text-muted)]">
        {stats}
      </div>
    </div>
    <div className="flex items-center gap-1.5 self-end sm:self-center">
      {actions}
    </div>
  </div>
)

interface AccountStatProps
{
  icon: ComponentType<SVGProps<SVGSVGElement>>
  value: number
  label: string
}

export const AccountStat = ({ icon: Icon, value, label }: AccountStatProps) => (
  <span className="inline-flex items-center gap-1">
    <Icon className="h-3 w-3" strokeWidth={1.8} />
    {formatCount(value)} {label}
  </span>
)
