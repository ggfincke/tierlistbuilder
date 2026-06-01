// src/features/marketplace/ui/consensus/section/ConsensusSectionSlots.tsx
// toolbar, rail, loading, & pagination slots for the consensus shell

import { Loader2 } from 'lucide-react'

import type { MarketplaceTemplateRankingAggregate } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import type { TemplateRankingAggregateItemsPageStatus } from '~/features/marketplace/model/detail/useRankingDetail'
import { SkeletonBlock } from '~/shared/ui/Skeleton'
import { ConsensusToolbar } from '../criterion/ConsensusToolbar'
import { ConsensusFeaturedSpotlight } from '../rail/ConsensusFeaturedSpotlight'
import {
  ConsensusRankingsRail,
  type ConsensusRailTab,
} from '../rail/ConsensusRankingsRail'
import { LaneStatsCard } from '../rail/LaneStatsCard'
import type { useConsensusBodyState } from './useConsensusBodyState'
import type { useConsensusRailData } from './useConsensusRailData'

type ConsensusBodyState = ReturnType<typeof useConsensusBodyState>
type ConsensusRailResult = ReturnType<typeof useConsensusRailData>['railResult']
type ConsensusSpotlightRanking = ReturnType<
  typeof useConsensusRailData
>['spotlightRanking']

export const SectionSkeleton = () => (
  <div aria-hidden="true" className="space-y-3">
    <SkeletonBlock className="h-9 w-full rounded-md" tone="soft" />
    {Array.from({ length: 4 }).map((_, index) => (
      <SkeletonBlock key={index} className="h-16 rounded-md" tone="soft" />
    ))}
  </div>
)

export const LoadMoreButton = ({
  status,
  onLoadMore,
}: {
  status: TemplateRankingAggregateItemsPageStatus
  onLoadMore: () => void
}) =>
{
  if (status !== 'CanLoadMore' && status !== 'LoadingMore') return null
  return (
    <div className="mt-4 flex justify-center">
      <button
        type="button"
        disabled={status !== 'CanLoadMore'}
        onClick={onLoadMore}
        className="focus-custom inline-flex h-10 items-center gap-2 rounded-md border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-4 text-sm font-semibold text-[var(--t-text)] transition hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
      >
        {status === 'LoadingMore' && (
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
        )}
        {status === 'LoadingMore' ? 'Loading items…' : 'Load more items'}
      </button>
    </div>
  )
}

interface ConsensusToolbarSlotProps
{
  query: string
  onQueryChange: ConsensusBodyState['setSearchQuery']
  sort: ConsensusBodyState['sort']
  onSortChange: ConsensusBodyState['setSort']
  vizMode: ConsensusBodyState['vizMode']
  onVizModeChange: ConsensusBodyState['setVizMode']
  totalCount: number
  isActiveRanking: boolean
  sourceRowCount: number
  filteredCount: number
}

export const ConsensusToolbarSlot = ({
  query,
  onQueryChange,
  sort,
  onSortChange,
  vizMode,
  onVizModeChange,
  totalCount,
  isActiveRanking,
  sourceRowCount,
  filteredCount,
}: ConsensusToolbarSlotProps) => (
  <ConsensusToolbar
    query={query}
    onQueryChange={onQueryChange}
    sort={sort}
    onSortChange={onSortChange}
    vizMode={vizMode}
    onVizModeChange={onVizModeChange}
    totalCount={isActiveRanking ? sourceRowCount : totalCount}
    filteredCount={filteredCount}
  />
)

interface ConsensusLaneStatsProps
{
  aggregate: MarketplaceTemplateRankingAggregate | null | undefined
  fallbackCount: number
}

const ConsensusLaneStats = ({
  aggregate,
  fallbackCount,
}: ConsensusLaneStatsProps) => (
  <LaneStatsCard
    rankingCount={aggregate?.rankingCount ?? fallbackCount}
    mostAgreed={aggregate?.mostAgreed ?? null}
    mostDivisive={aggregate?.mostDivisive ?? null}
    computedAt={aggregate?.computedAt ?? null}
  />
)

interface ConsensusRailSlotProps
{
  rankingCount: number
  aggregateForStats: MarketplaceTemplateRankingAggregate | null | undefined
  spotlightRanking: ConsensusSpotlightRanking
  activeSlug: string | null
  onSelectRanking: (slug: string | null) => void
  railResult: ConsensusRailResult
  railTab: ConsensusRailTab
  onRailTabChange: (next: ConsensusRailTab) => void
  forceLoading?: boolean
}

export const ConsensusRailSlot = ({
  rankingCount,
  aggregateForStats,
  spotlightRanking,
  activeSlug,
  onSelectRanking,
  railResult,
  railTab,
  onRailTabChange,
  forceLoading = false,
}: ConsensusRailSlotProps) =>
{
  const railLoading =
    forceLoading ||
    (railResult.status === 'LoadingFirstPage' && railResult.items.length === 0)
  const rankings = forceLoading ? [] : railResult.items
  const loadMoreEligible =
    !forceLoading &&
    railTab === 'all' &&
    (railResult.status === 'CanLoadMore' || railResult.status === 'LoadingMore')
  const loadMoreLabel =
    forceLoading || railResult.status === 'LoadingMore'
      ? 'Loading…'
      : 'Load more rankings'

  return (
    <>
      <ConsensusLaneStats
        aggregate={aggregateForStats}
        fallbackCount={rankingCount}
      />
      {!forceLoading && spotlightRanking && (
        <ConsensusFeaturedSpotlight
          ranking={spotlightRanking}
          active={activeSlug === spotlightRanking.slug}
          onSelect={() =>
            onSelectRanking(
              activeSlug === spotlightRanking.slug
                ? null
                : spotlightRanking.slug
            )
          }
        />
      )}
      <ConsensusRankingsRail
        rankingCount={rankingCount}
        rankings={rankings}
        isLoading={railLoading}
        activeSlug={activeSlug}
        onSelect={onSelectRanking}
        tab={railTab}
        onTabChange={onRailTabChange}
        loadMoreEligible={loadMoreEligible}
        loadMoreLabel={loadMoreLabel}
        onLoadMore={() => railResult.loadMore()}
      />
    </>
  )
}
