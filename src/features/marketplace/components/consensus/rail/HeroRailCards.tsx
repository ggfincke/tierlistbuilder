// src/features/marketplace/components/consensus/rail/HeroRailCards.tsx
// editorial cards next to hero meta. server-side sorts keep both rails exact

import { Crown, Flame } from 'lucide-react'
import type { ReactNode } from 'react'

import type {
  MarketplaceTemplateRankingAggregate,
  MarketplaceTemplateRankingAggregateItem,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import type { BoardLabelSettings } from '@tierlistbuilder/contracts/workspace/board'
import { useTemplateRankingAggregateItems } from '~/features/marketplace/model/detail/useRankingDetail'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { SkeletonBlock, SkeletonText } from '~/shared/ui/Skeleton'

import {
  AggregateItemThumb,
  type AggregateItemFrame,
} from '../item/AggregateItemThumb'
import { RailCard } from './RailCard'
import {
  formatPercent,
  getAggregateItemLabel,
  getTopBucket,
  resolveBucketColor,
} from '../lib/utils'

const RAIL_LIMIT = 3
const DIVISIVE_PAGE_SIZE = 8
const CONSENSUS_PAGE_SIZE = 3

interface HeroRailCardsProps
{
  templateSlug: string
  aggregate: MarketplaceTemplateRankingAggregate
  frame: AggregateItemFrame
  labelSettings: BoardLabelSettings | null
}

interface HeroRailCardsLoadingProps
{
  rankingCount: number
}

interface RailRowProps
{
  row: MarketplaceTemplateRankingAggregateItem
  aggregate: MarketplaceTemplateRankingAggregate
  frame: AggregateItemFrame
  labelSettings: BoardLabelSettings | null
  detail: string
  badge: ReactNode
}

const RailRow = ({
  row,
  aggregate,
  frame,
  labelSettings,
  detail,
  badge,
}: RailRowProps) => (
  <li className="flex items-center gap-2.5 rounded-md py-0.5">
    <AggregateItemThumb
      row={row}
      frame={frame}
      labelSettings={labelSettings}
      size={36}
    />
    <div className="min-w-0 flex-1">
      <p className="truncate text-[13px] font-medium text-[var(--t-text)]">
        {getAggregateItemLabel(row)}
      </p>
      <p className="truncate text-[11px] text-[var(--t-text-muted)]">
        {detail}
      </p>
    </div>
    {badge}
    <span className="sr-only">
      Tier {getTopBucket(row, aggregate.buckets)?.label ?? 'unknown'}
    </span>
  </li>
)

const SkeletonRow = () => (
  <li
    aria-hidden="true"
    className="flex items-center gap-2.5 rounded-md py-0.5"
  >
    <SkeletonBlock className="h-9 w-9 rounded-md" />
    <div className="flex-1 space-y-1.5">
      <SkeletonText className="w-2/3" />
      <SkeletonBlock className="h-2 w-1/2 rounded" tone="soft" />
    </div>
  </li>
)

const SkeletonList = () => (
  <ul className="space-y-2.5">
    {Array.from({ length: RAIL_LIMIT }).map((_, index) => (
      <SkeletonRow key={index} />
    ))}
  </ul>
)

export const HeroRailCardsLoading = ({
  rankingCount,
}: HeroRailCardsLoadingProps) => (
  <>
    <RailCard
      eyebrow={
        <>
          <Flame
            className="h-3 w-3 text-[var(--t-destructive)]"
            strokeWidth={2}
          />
          Most divisive
        </>
      }
      meta={rankingCount > 0 ? `n = ${rankingCount}` : undefined}
    >
      <SkeletonList />
    </RailCard>

    <RailCard
      eyebrow={
        <>
          <Crown className="h-3 w-3 text-[var(--t-success)]" strokeWidth={2} />
          Strongest consensus
        </>
      }
    >
      <SkeletonList />
    </RailCard>
  </>
)

export const HeroRailCards = ({
  templateSlug,
  aggregate,
  frame,
  labelSettings,
}: HeroRailCardsProps) =>
{
  const paletteId = usePreferencesStore((state) => state.paletteId)
  const enabled =
    aggregate.activeGeneration !== null &&
    (aggregate.state === 'ready' || aggregate.state === 'stale')
  const generation = aggregate.activeGeneration

  const criterionExternalId = aggregate.criterion.externalId

  const divisivePage = useTemplateRankingAggregateItems({
    templateSlug,
    criterionExternalId,
    generation,
    sort: 'controversy',
    enabled,
    pageSize: DIVISIVE_PAGE_SIZE,
  })

  const consensusPage = useTemplateRankingAggregateItems({
    templateSlug,
    criterionExternalId,
    generation,
    sort: 'consensusTop',
    enabled,
    pageSize: CONSENSUS_PAGE_SIZE,
  })

  const divisive = divisivePage.items
    .filter((row) => row.sampleCount > 0)
    .slice(0, RAIL_LIMIT)
  const strongest = consensusPage.items
    .filter((row) => row.sampleCount > 0)
    .slice(0, RAIL_LIMIT)

  const divisiveLoading = divisivePage.status === 'LoadingFirstPage'
  const strongestLoading = consensusPage.status === 'LoadingFirstPage'

  const divisiveEmpty = !divisiveLoading && divisive.length === 0
  const strongestEmpty = !strongestLoading && strongest.length === 0
  if (divisiveEmpty && strongestEmpty) return null

  return (
    <>
      {(divisiveLoading || divisive.length > 0) && (
        <RailCard
          eyebrow={
            <>
              <Flame
                className="h-3 w-3 text-[var(--t-destructive)]"
                strokeWidth={2}
              />
              Most divisive
            </>
          }
          meta={`n = ${aggregate.rankingCount}`}
        >
          {divisiveLoading ? (
            <SkeletonList />
          ) : (
            <ul className="space-y-2.5">
              {divisive.map((row) =>
                {
                const top = getTopBucket(row, aggregate.buckets)
                return (
                  <RailRow
                    key={row.externalId}
                    row={row}
                    aggregate={aggregate}
                    frame={frame}
                    labelSettings={labelSettings}
                    detail={
                      top
                        ? `Split — only ${formatPercent(row.topBucketShare)} agree on ${top.label}`
                        : 'Spread across tiers'
                    }
                    badge={
                      <span
                        aria-hidden="true"
                        className="shrink-0 rounded-md bg-[var(--t-destructive)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-white"
                      >
                        !
                      </span>
                    }
                  />
                )
              })}
            </ul>
          )}
        </RailCard>
      )}

      {(strongestLoading || strongest.length > 0) && (
        <RailCard
          eyebrow={
            <>
              <Crown
                className="h-3 w-3 text-[var(--t-success)]"
                strokeWidth={2}
              />
              Strongest consensus
            </>
          }
        >
          {strongestLoading ? (
            <SkeletonList />
          ) : (
            <ul className="space-y-2.5">
              {strongest.map((row) =>
                {
                const top = getTopBucket(row, aggregate.buckets)
                return (
                  <RailRow
                    key={row.externalId}
                    row={row}
                    aggregate={aggregate}
                    frame={frame}
                    labelSettings={labelSettings}
                    detail={
                      top
                        ? `${formatPercent(row.topBucketShare)} agree on ${top.label}`
                        : `${formatPercent(row.topBucketShare)} agreement`
                    }
                    badge={
                      top ? (
                        <span
                          aria-hidden="true"
                          className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold"
                          style={{
                            background: resolveBucketColor(top, paletteId),
                            color: 'rgba(0,0,0,0.78)',
                          }}
                        >
                          {top.label}
                        </span>
                      ) : null
                    }
                  />
                )
              })}
            </ul>
          )}
        </RailCard>
      )}
    </>
  )
}
