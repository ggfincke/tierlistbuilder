// src/features/marketplace/components/consensus/ConsensusFeaturedSpotlight.tsx
// richer card sat above the rail when the Featured tab is active & there's
// at least one curated ranking. uses the first featured ranking's metadata

import { Crown, Eye } from 'lucide-react'

import type { MarketplaceRankingSummary } from '@tierlistbuilder/contracts/marketplace/ranking'
import { RANKING_FEATURED_BADGE_LABELS } from '@tierlistbuilder/contracts/marketplace/ranking'
import { formatCount, formatRelativeTime } from '~/shared/catalog/formatters'

import { avatarColor } from './utils'

interface ConsensusFeaturedSpotlightProps
{
  ranking: MarketplaceRankingSummary
  active: boolean
  onSelect: () => void
}

export const ConsensusFeaturedSpotlight = ({
  ranking,
  active,
  onSelect,
}: ConsensusFeaturedSpotlightProps) =>
{
  const badgeLabel = ranking.featuredBadge
    ? RANKING_FEATURED_BADGE_LABELS[ranking.featuredBadge]
    : 'Featured'
  const swatch = avatarColor(ranking.slug)
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className="focus-custom relative shrink-0 overflow-hidden rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface)] text-left transition hover:border-[var(--t-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
      style={{
        backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${swatch} 18%, transparent), transparent 60%)`,
      }}
    >
      <div className="flex items-start gap-3 px-3 py-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-black/70"
          style={{ background: swatch }}
        >
          <Crown className="h-4 w-4" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--t-warning,#facc15)]">
              {badgeLabel} ranking
            </p>
            {active && (
              <span className="shrink-0 rounded-sm bg-[var(--t-accent)] px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--t-accent-foreground)]">
                Active
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[13px] font-semibold text-[var(--t-text)]">
            {ranking.title}
          </p>
          {ranking.description && (
            <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-[var(--t-text-muted)]">
              {ranking.description}
            </p>
          )}
          <p className="mt-1.5 inline-flex items-center gap-2 font-mono text-[10px] text-[var(--t-text-faint)]">
            <span>{ranking.author.displayName}</span>
            <span>·</span>
            <span>{formatRelativeTime(ranking.updatedAt)}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-0.5">
              <Eye className="h-2.5 w-2.5" strokeWidth={2} />
              {formatCount(ranking.viewCount)}
            </span>
          </p>
        </div>
      </div>
    </button>
  )
}
