// src/features/marketplace/ui/account/AccountRankingsSection.tsx
// owned-ranking management list — read-only stats w/ a link to the
// public ranking page

import { ExternalLink, Eye, Sparkles } from 'lucide-react'

import type { MarketplaceRankingSummary } from '@tierlistbuilder/contracts/marketplace/ranking'
import { useMyRankings } from '~/features/marketplace/model/detail/useRankingDetail'
import { CATEGORY_META } from '~/features/marketplace/model/categories'
import { CriterionBadge } from '~/features/marketplace/ui/consensus/criterion/CriterionBadge'
import { formatRelativeTime } from '~/shared/lib/dateFormatting'
import { RANKINGS_ROUTE_PATH } from '~/shared/routes/pathname'
import { EmptyCard } from '~/shared/ui/EmptyCard'
import { SkeletonBlock } from '~/shared/ui/Skeleton'
import {
  AccountIconLink,
  AccountRow,
  AccountStat,
  AccountVisibilityBadge,
} from './accountBadges'

const RankingRow = ({ ranking }: { ranking: MarketplaceRankingSummary }) =>
{
  const categoryLabel = CATEGORY_META[ranking.template.category].label
  return (
    <AccountRow
      title={ranking.title}
      badges={
        <>
          <AccountVisibilityBadge visibility={ranking.visibility} />
          <CriterionBadge criterion={ranking.criterion} />
        </>
      }
      meta={
        <>
          {categoryLabel} · From {ranking.template.title} · Updated{' '}
          {formatRelativeTime(ranking.updatedAt)}
        </>
      }
      stats={
        <>
          <AccountStat
            icon={Sparkles}
            value={ranking.remixCount}
            label="remixes"
          />
          <AccountStat icon={Eye} value={ranking.viewCount} label="views" />
        </>
      }
      actions={
        <AccountIconLink
          to={`${RANKINGS_ROUTE_PATH}/${ranking.slug}`}
          ariaLabel={`View ${ranking.title}`}
          title="View ranking"
        >
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} />
        </AccountIconLink>
      }
    />
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
      <EmptyCard
        radius="md"
        padding="sm"
        body="Complete a template ranking & publish it to share your ranking with the community."
      />
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
