// src/features/marketplace/ui/consensus/rail/LaneStatsCard.tsx
// compact stats panel for count, agreement, divisive pick, & last update

import { Sparkles } from 'lucide-react'

import type { MarketplaceTemplateRankingAggregateHighlight } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import { formatCount } from '~/shared/catalog/formatters'
import { formatRelativeTime } from '~/shared/lib/dateFormatting'

import { RailCard } from './RailCard'
import { getAggregateItemLabel } from '../lib/utils'

interface LaneStatsCardProps
{
  rankingCount: number
  mostAgreed: MarketplaceTemplateRankingAggregateHighlight | null
  mostDivisive: MarketplaceTemplateRankingAggregateHighlight | null
  computedAt: number | null
}

const FALLBACK_LABEL = '—'

const StatRow = ({
  label,
  value,
  monospace = false,
  muted = false,
}: {
  label: string
  value: string
  monospace?: boolean
  muted?: boolean
}) => (
  <>
    <dt className="text-[var(--t-text-muted)]">{label}</dt>
    <dd
      className={`truncate text-right ${
        muted ? 'text-[var(--t-text-muted)]' : 'text-[var(--t-text)]'
      } ${monospace ? 'font-mono font-semibold tabular-nums' : ''}`}
    >
      {value}
    </dd>
  </>
)

export const LaneStatsCard = ({
  rankingCount,
  mostAgreed,
  mostDivisive,
  computedAt,
}: LaneStatsCardProps) =>
{
  const updatedLabel =
    typeof computedAt === 'number' ? formatRelativeTime(computedAt) : 'Pending'
  return (
    <RailCard
      eyebrow={
        <>
          <Sparkles className="h-3 w-3" strokeWidth={2} />
          Lane stats
        </>
      }
    >
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <StatRow label="Rankings" value={formatCount(rankingCount)} monospace />
        <StatRow
          label="Most agreed"
          value={
            mostAgreed ? getAggregateItemLabel(mostAgreed) : FALLBACK_LABEL
          }
        />
        <StatRow
          label="Most divisive"
          value={
            mostDivisive ? getAggregateItemLabel(mostDivisive) : FALLBACK_LABEL
          }
        />
        <StatRow label="Updated" value={updatedLabel} muted />
      </dl>
    </RailCard>
  )
}
