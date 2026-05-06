// src/features/marketplace/model/useCompareRanking.ts
// projects a chosen ranking into per-template-item bucket placements

import { useMemo } from 'react'

import {
  buildRankingBucketPlacements,
  type MarketplaceRankingDetail,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import { useRankingBySlug } from '~/features/marketplace/data/rankingsRepository'

interface CompareRankingResult
{
  detail: MarketplaceRankingDetail | null | undefined
  placements: Record<string, number> | null
}

interface UseCompareRankingArgs
{
  slug: string | null
  bucketCount: number | null | undefined
}

const placementsCache = new Map<string, Record<string, number>>()

export const useCompareRanking = ({
  slug,
  bucketCount,
}: UseCompareRankingArgs): CompareRankingResult =>
{
  const detail = useRankingBySlug(slug)
  const placements = useMemo<Record<string, number> | null>(() =>
  {
    if (slug === null || detail === undefined || detail === null) return null
    if (typeof bucketCount !== 'number') return null
    const key = [
      detail.slug,
      detail.updatedAt,
      detail.tierCount,
      detail.itemCount,
      bucketCount,
    ].join(':')
    const cached = placementsCache.get(key)
    if (cached) return cached
    const next = buildRankingBucketPlacements(
      detail.tiers,
      detail.items,
      bucketCount
    )
    placementsCache.set(key, next)
    return next
  }, [slug, detail, bucketCount])
  if (slug === null) return { detail: null, placements: null }
  return { detail, placements }
}
