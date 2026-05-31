// src/features/marketplace/model/detail/useCompareRanking.ts
// projects a chosen ranking into per-template-item bucket placements

import { useMemo } from 'react'

import {
  buildRankingBucketPlacements,
  type MarketplaceRankingDetail,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import {
  buildAggregateBucketsFromTiers,
  type MarketplaceTemplateRankingAggregateBucket,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import { useRankingBySlug } from '~/features/marketplace/data/rankingsRepository'
import { setMapEntryLru, touchMapEntry } from '~/shared/lib/lru'

interface CompareRankingResult
{
  detail: MarketplaceRankingDetail | null | undefined
  placements: Record<string, number> | null
  buckets: MarketplaceTemplateRankingAggregateBucket[] | null
}

interface UseCompareRankingArgs
{
  slug: string | null
}

interface CompareRankingProjection
{
  placements: Record<string, number>
  buckets: MarketplaceTemplateRankingAggregateBucket[]
}

const MAX_COMPARE_RANKING_PROJECTION_CACHE_ENTRIES = 32
const projectionCache = new Map<string, CompareRankingProjection>()

export const useCompareRanking = ({
  slug,
}: UseCompareRankingArgs): CompareRankingResult =>
{
  const detail = useRankingBySlug(slug)
  const projection = useMemo<CompareRankingProjection | null>(() =>
  {
    if (slug === null || detail === undefined || detail === null) return null
    const key = [
      detail.slug,
      detail.updatedAt,
      detail.tierCount,
      detail.itemCount,
    ].join(':')
    const cached = projectionCache.get(key)
    if (cached)
    {
      touchMapEntry(projectionCache, key)
      return cached
    }
    const orderedTiers = detail.tiers.slice().sort((a, b) => a.order - b.order)
    const buckets = buildAggregateBucketsFromTiers(orderedTiers)
    const placements = buildRankingBucketPlacements(
      detail.tiers,
      detail.items,
      buckets.length
    )
    const next = { buckets, placements }
    setMapEntryLru(
      projectionCache,
      key,
      next,
      MAX_COMPARE_RANKING_PROJECTION_CACHE_ENTRIES
    )
    return next
  }, [slug, detail])
  if (slug === null) return { detail: null, placements: null, buckets: null }
  return {
    detail,
    placements: projection?.placements ?? null,
    buckets: projection?.buckets ?? null,
  }
}
