// src/features/marketplace/components/AccountRankingsSection.tsx
// owned-ranking management list — read-only stats w/ a link to the
// public ranking page

import { ExternalLink, Eye, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import type {
  MarketplaceRankingSummary,
  RankingVisibility,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import { useMyRankings } from '~/features/marketplace/model/useRankingDetail'
import { CATEGORY_META } from '~/features/marketplace/model/categories'
import { formatCount, formatRelativeTime } from '~/shared/catalog/formatters'
import { RANKINGS_ROUTE_PATH } from '~/shared/routes/pathname'
import { SkeletonBlock } from '~/shared/ui/Skeleton'

const VisibilityBadge = ({ visibility }: { visibility: RankingVisibility }) =>
{
  if (visibility === 'unlisted')
  {
    return (
      <span className="rounded-full border border-[var(--t-border)] bg-[var(--t-bg-page)] px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--t-text-faint)]">
        Unlisted
      </span>
    )
  }
  return (
    <span className="rounded-full bg-[rgb(var(--t-overlay)/0.06)] px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--t-text-secondary)]">
      Public
    </span>
  )
}

const RankingRow = ({ ranking }: { ranking: MarketplaceRankingSummary }) =>
{
  const categoryLabel = CATEGORY_META[ranking.template.category].label
  return (
    <div className="flex flex-col gap-2 rounded-md border border-[var(--t-border)] bg-[var(--t-bg-surface)] p-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-[var(--t-text)]">
            {ranking.title}
          </span>
          <VisibilityBadge visibility={ranking.visibility} />
        </div>
        <p className="mt-0.5 text-[11px] text-[var(--t-text-faint)]">
          {categoryLabel} · From {ranking.template.title} · Updated{' '}
          {formatRelativeTime(ranking.updatedAt)}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-[var(--t-text-muted)]">
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3" strokeWidth={1.8} />
            {formatCount(ranking.remixCount)} remixes
          </span>
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3 w-3" strokeWidth={1.8} />
            {formatCount(ranking.viewCount)} views
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 self-end sm:self-center">
        <Link
          to={`${RANKINGS_ROUTE_PATH}/${ranking.slug}`}
          aria-label={`View ${ranking.title}`}
          title="View ranking"
          className="focus-custom inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--t-border)] text-[var(--t-text-muted)] transition hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
        >
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} />
        </Link>
      </div>
    </div>
  )
}

const SkeletonRow = () => (
  <SkeletonBlock
    className="h-[68px] rounded-md border border-[var(--t-border)]"
    tone="soft"
  />
)

export const AccountRankingsSection = () =>
{
  const list = useMyRankings(true)

  if (list === undefined)
  {
    return (
      <div className="space-y-2">
        <SkeletonRow />
      </div>
    )
  }

  if (list.items.length === 0)
  {
    return (
      <p className="rounded-md border border-dashed border-[var(--t-border)] bg-[rgb(var(--t-overlay)/0.02)] px-4 py-6 text-center text-sm text-[var(--t-text-muted)]">
        Complete a template ranking & publish it to share your ranking with the
        community.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {list.items.map((ranking) => (
        <RankingRow key={ranking.slug} ranking={ranking} />
      ))}
    </div>
  )
}
