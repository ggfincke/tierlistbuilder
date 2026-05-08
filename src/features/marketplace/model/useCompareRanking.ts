// src/features/marketplace/model/useCompareRanking.ts
// projects a chosen ranking into per-template-item bucket placements

import { useMemo } from 'react'

import {
  buildRankingBucketPlacements,
  type MarketplaceRankingDetail,
  type MarketplaceRankingTier,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import type { MarketplaceTemplateRankingAggregateBucket } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import { useRankingBySlug } from '~/features/marketplace/data/rankingsRepository'

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

const projectionCache = new Map<string, CompareRankingProjection>()

const rankingBuckets = (
  tiers: readonly MarketplaceRankingTier[]
): MarketplaceTemplateRankingAggregateBucket[] =>
  tiers
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((tier, index) => ({
      index,
      label: tier.name,
      colorSpec: tier.colorSpec,
    }))

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
    if (cached) return cached
    const buckets = rankingBuckets(detail.tiers)
    const placements = buildRankingBucketPlacements(
      detail.tiers,
      detail.items,
      buckets.length
    )
    const next = { buckets, placements }
    projectionCache.set(key, next)
    return next
  }, [slug, detail])
  if (slug === null) return { detail: null, placements: null, buckets: null }
  return {
    detail,
    placements: projection?.placements ?? null,
    buckets: projection?.buckets ?? null,
  }
}
