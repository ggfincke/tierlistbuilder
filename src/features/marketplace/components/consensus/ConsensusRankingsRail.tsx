// src/features/marketplace/components/consensus/ConsensusRankingsRail.tsx
// rail-shape ranking picker that projects community or author placements

import {
  Clock,
  Crown,
  Eye,
  Layers,
  TrendingUp,
  X,
  type LucideIcon,
} from 'lucide-react'

import type { MarketplaceRankingSummary } from '@tierlistbuilder/contracts/marketplace/ranking'
import { RANKING_FEATURED_BADGE_LABELS } from '@tierlistbuilder/contracts/marketplace/ranking'
import { formatCount } from '~/shared/catalog/formatters'
import { formatRelativeTime } from '~/shared/lib/dateFormatting'
import { SkeletonBlock, SkeletonText } from '~/shared/ui/Skeleton'
import { avatarColor } from './utils'

export type ConsensusRailTab = 'featured' | 'recent' | 'top' | 'all'

interface ConsensusRailTabConfig
{
  value: ConsensusRailTab
  label: string
  Icon: LucideIcon
}

const TABS: ConsensusRailTabConfig[] = [
  { value: 'featured', label: 'Featured', Icon: Crown },
  { value: 'recent', label: 'Recent', Icon: Clock },
  { value: 'top', label: 'Top', Icon: TrendingUp },
  { value: 'all', label: 'All', Icon: Layers },
]

interface ConsensusRankingsRailProps
{
  rankingCount: number
  rankings: readonly MarketplaceRankingSummary[]
  isLoading: boolean
  activeSlug: string | null
  onSelect: (slug: string | null) => void
  tab: ConsensusRailTab
  onTabChange: (next: ConsensusRailTab) => void
  loadMoreEligible: boolean
  loadMoreLabel: string
  onLoadMore: () => void
}

const RailHeader = ({
  rankingCount,
  activeRanking,
  onReset,
}: {
  rankingCount: number
  activeRanking: MarketplaceRankingSummary | null
  onReset: () => void
}) => (
  <div className="flex items-center justify-between gap-2 border-b border-[var(--t-border)] px-3 py-2.5">
    <div className="min-w-0">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--t-text-faint)]">
        Showing
      </p>
      <p className="truncate text-[13px] font-semibold text-[var(--t-text)]">
        {activeRanking ? activeRanking.title : 'Community average'}
      </p>
    </div>
    {activeRanking ? (
      <button
        type="button"
        onClick={onReset}
        className="focus-custom inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--t-text-muted)] transition hover:bg-[var(--t-bg-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
        title="Show community average"
      >
        <X className="h-2.5 w-2.5" strokeWidth={2.2} />
        Reset
      </button>
    ) : (
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--t-text-faint)]">
        n = {formatCount(rankingCount)}
      </span>
    )}
  </div>
)

const RailTabs = ({
  tab,
  onTabChange,
}: {
  tab: ConsensusRailTab
  onTabChange: (next: ConsensusRailTab) => void
}) => (
  <div className="border-b border-[var(--t-border)] px-2 py-2">
    <div
      role="tablist"
      aria-label="Rankings filter"
      className="flex items-center gap-0.5 rounded-md border border-[var(--t-border)] bg-[var(--t-bg-sunken)] p-0.5"
    >
      {TABS.map(({ value, label, Icon }) =>
      {
        const active = tab === value
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onTabChange(value)}
            className={`focus-custom inline-flex h-7 flex-1 items-center justify-center gap-1 rounded text-[11px] font-medium transition focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] ${
              active
                ? 'bg-[var(--t-bg-active)] text-[var(--t-text)]'
                : 'text-[var(--t-text-muted)] hover:text-[var(--t-text)]'
            }`}
          >
            <Icon className="h-2.5 w-2.5" strokeWidth={2} />
            {label}
          </button>
        )
      })}
    </div>
  </div>
)

const AggregateRow = ({
  rankingCount,
  active,
  onSelect,
}: {
  rankingCount: number
  active: boolean
  onSelect: () => void
}) => (
  <button
    type="button"
    onClick={onSelect}
    className={`focus-custom group flex items-center gap-2.5 border-b border-[var(--t-border)] px-3 py-2 text-left transition focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] ${
      active ? 'bg-[var(--t-bg-active)]' : 'hover:bg-[var(--t-bg-hover)]'
    }`}
  >
    <span
      aria-hidden="true"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--t-border)] bg-[var(--t-bg-sunken)] text-[var(--t-text-muted)]"
    >
      <Layers className="h-3 w-3" strokeWidth={2} />
    </span>
    <div className="min-w-0 flex-1">
      <p className="truncate text-[13px] font-medium text-[var(--t-text)]">
        Community average
      </p>
      <p className="truncate text-[11px] text-[var(--t-text-muted)]">
        Aggregate of all {formatCount(rankingCount)}{' '}
        {rankingCount === 1 ? 'ranking' : 'rankings'}
      </p>
    </div>
    {active && (
      <span className="shrink-0 rounded-sm bg-[var(--t-accent)] px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--t-accent-foreground)]">
        Active
      </span>
    )}
  </button>
)

const RankingRow = ({
  ranking,
  active,
  onSelect,
}: {
  ranking: MarketplaceRankingSummary
  active: boolean
  onSelect: () => void
}) =>
{
  const isFeatured = ranking.featuredBadge !== null
  const badgeLabel = ranking.featuredBadge
    ? RANKING_FEATURED_BADGE_LABELS[ranking.featuredBadge]
    : null
  return (
    <li className="border-b border-[var(--t-border)] last:border-b-0">
      <button
        type="button"
        onClick={onSelect}
        className={`focus-custom group flex w-full items-center gap-2.5 px-3 py-2 text-left transition focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] ${
          active ? 'bg-[var(--t-bg-active)]' : 'hover:bg-[var(--t-bg-hover)]'
        }`}
      >
        <span
          aria-hidden="true"
          className="relative h-7 w-7 shrink-0 rounded-full"
          style={{ background: avatarColor(ranking.slug) }}
        >
          {isFeatured && (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--t-bg-surface)] text-[var(--t-warning,#facc15)] ring-1 ring-[var(--t-border)]"
              title="Featured ranking"
            >
              <Crown className="h-2 w-2" strokeWidth={2.2} />
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-[var(--t-text)]">
            {ranking.title}
          </p>
          <p className="truncate text-[11px] text-[var(--t-text-muted)]">
            {badgeLabel && (
              <span className="mr-1 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--t-warning,#facc15)]">
                {badgeLabel}
              </span>
            )}
            {ranking.author.displayName} ·{' '}
            {formatRelativeTime(ranking.updatedAt)}
          </p>
        </div>
        {active ? (
          <span className="shrink-0 rounded-sm bg-[var(--t-accent)] px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--t-accent-foreground)]">
            Active
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-0.5 font-mono text-[10px] text-[var(--t-text-faint)]">
            <Eye className="h-2.5 w-2.5" strokeWidth={2} />
            {formatCount(ranking.viewCount)}
          </span>
        )}
      </button>
    </li>
  )
}

const RankingsListSkeleton = () => (
  <ul className="flex flex-col" aria-hidden="true">
    {Array.from({ length: 4 }).map((_, index) => (
      <li
        key={index}
        className="flex items-center gap-2.5 border-b border-[var(--t-border)] px-3 py-2 last:border-b-0"
      >
        <SkeletonBlock className="h-7 w-7 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <SkeletonText className="w-3/4" />
          <SkeletonBlock className="h-2 w-1/2 rounded" tone="soft" />
        </div>
      </li>
    ))}
  </ul>
)

export const ConsensusRankingsRail = ({
  rankingCount,
  rankings,
  isLoading,
  activeSlug,
  onSelect,
  tab,
  onTabChange,
  loadMoreEligible,
  loadMoreLabel,
  onLoadMore,
}: ConsensusRankingsRailProps) =>
{
  const activeRanking =
    activeSlug !== null
      ? (rankings.find((r) => r.slug === activeSlug) ?? null)
      : null

  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface)] lg:flex-1">
      <RailHeader
        rankingCount={rankingCount}
        activeRanking={activeRanking}
        onReset={() => onSelect(null)}
      />
      <RailTabs tab={tab} onTabChange={onTabChange} />
      <AggregateRow
        rankingCount={rankingCount}
        active={activeSlug === null}
        onSelect={() => onSelect(null)}
      />
      <ul className="flex min-h-0 flex-col overflow-y-auto lg:flex-1">
        {isLoading ? (
          <RankingsListSkeleton />
        ) : rankings.length === 0 ? (
          <li className="px-3 py-6 text-center text-[12px] text-[var(--t-text-faint)]">
            {tab === 'featured'
              ? 'No featured rankings for this template yet.'
              : 'No public rankings yet.'}
          </li>
        ) : (
          rankings.map((ranking) => (
            <RankingRow
              key={ranking.slug}
              ranking={ranking}
              active={activeSlug === ranking.slug}
              onSelect={() =>
                onSelect(activeSlug === ranking.slug ? null : ranking.slug)
              }
            />
          ))
        )}
        {loadMoreEligible && (
          <li className="border-t border-[var(--t-border)]">
            <button
              type="button"
              onClick={onLoadMore}
              className="focus-custom flex w-full items-center justify-center gap-1 px-3 py-2 text-[11px] font-medium text-[var(--t-text-muted)] transition hover:bg-[var(--t-bg-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
            >
              {loadMoreLabel}
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}
