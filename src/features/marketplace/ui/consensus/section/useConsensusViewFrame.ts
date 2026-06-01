// src/features/marketplace/ui/consensus/section/useConsensusViewFrame.ts
// stable render-frame cache for aggregate & pinned-ranking swaps

import { useEffect, useMemo } from 'react'

import type {
  MarketplaceTemplateRankingAggregate,
  MarketplaceTemplateRankingAggregateBucket,
  MarketplaceTemplateRankingAggregateItem,
  TemplateRankingAggregateItemSort,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import { isTemplateRankingAggregateReady as isAggregateReady } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import type { RankingFeaturedBadge } from '@tierlistbuilder/contracts/marketplace/ranking'
import { setMapEntryLru } from '~/shared/lib/lru'

const MAX_VIEW_FRAME_CACHE_ENTRIES = 24

export interface ActiveRankingMeta
{
  title: string
  authorName: string
  updatedAt: number
  featuredBadge: RankingFeaturedBadge | null
}

// snapshot of what the body is currently rendering. cached so a pin swap
// can keep the previous viz + header mounted while new detail loads
interface ViewFrame
{
  aggregate: MarketplaceTemplateRankingAggregate
  rows: readonly MarketplaceTemplateRankingAggregateItem[]
  buckets: readonly MarketplaceTemplateRankingAggregateBucket[]
  yourPlacements: Record<string, number> | null
  showControversy: boolean
  // header eyebrow + title so SectionHeader doesn't flicker through
  // "Community consensus" between pin1 -> pin2 swaps
  activeRankingMeta: ActiveRankingMeta | null
}

interface UseConsensusViewFrameInput
{
  activeRankingMeta: ActiveRankingMeta | null
  aggregate: MarketplaceTemplateRankingAggregate | null | undefined
  compareBuckets: readonly MarketplaceTemplateRankingAggregateBucket[] | null
  criterionExternalId: string
  filteredRows: readonly MarketplaceTemplateRankingAggregateItem[]
  isActiveRanking: boolean
  isPinFailed: boolean
  isPinLoading: boolean
  overlayActive: boolean
  sort: TemplateRankingAggregateItemSort
  templateSlug: string
  yourPlacements: Record<string, number> | null
}

const VIEW_FRAME_CACHE = new Map<string, ViewFrame>()

const rememberViewFrame = (key: string, frame: ViewFrame): void =>
{
  setMapEntryLru(VIEW_FRAME_CACHE, key, frame, MAX_VIEW_FRAME_CACHE_ENTRIES)
}

export const useConsensusViewFrame = ({
  activeRankingMeta,
  aggregate,
  compareBuckets,
  criterionExternalId,
  filteredRows,
  isActiveRanking,
  isPinFailed,
  isPinLoading,
  overlayActive,
  sort,
  templateSlug,
  yourPlacements,
}: UseConsensusViewFrameInput) =>
{
  const currentFrame = useMemo<ViewFrame | null>(() =>
  {
    if (isPinLoading || isPinFailed) return null
    if (!aggregate || !isAggregateReady(aggregate)) return null
    if (filteredRows.length === 0) return null
    const buckets =
      isActiveRanking && compareBuckets ? compareBuckets : aggregate.buckets
    return {
      aggregate,
      rows: filteredRows,
      buckets,
      yourPlacements: overlayActive ? yourPlacements : null,
      showControversy: sort === 'controversy' && !isActiveRanking,
      activeRankingMeta,
    }
  }, [
    activeRankingMeta,
    aggregate,
    compareBuckets,
    filteredRows,
    isActiveRanking,
    isPinFailed,
    isPinLoading,
    overlayActive,
    sort,
    yourPlacements,
  ])

  // scoped by template + criterion so a lane swap never shows wrong tiers
  // behind a load. write in an effect — mutating module state during render
  // breaks under StrictMode double-invoke + concurrent rendering
  const frameCacheKey = `${templateSlug}:${criterionExternalId}`
  useEffect(() =>
  {
    if (currentFrame === null) return
    if (VIEW_FRAME_CACHE.get(frameCacheKey) === currentFrame) return
    rememberViewFrame(frameCacheKey, currentFrame)
  }, [currentFrame, frameCacheKey])

  const cachedFrame =
    currentFrame === null ? (VIEW_FRAME_CACHE.get(frameCacheKey) ?? null) : null
  const showPinStaleFrame = isPinLoading && cachedFrame !== null
  const showLaneStaleFrame =
    aggregate === undefined && !isActiveRanking && cachedFrame !== null
  const showStaleFrame = showPinStaleFrame || showLaneStaleFrame
  const renderFrame = currentFrame ?? (showStaleFrame ? cachedFrame : null)

  return {
    cachedFrame,
    renderFrame,
    showLaneStaleFrame,
    showPinStaleFrame,
    showStaleFrame,
  }
}
