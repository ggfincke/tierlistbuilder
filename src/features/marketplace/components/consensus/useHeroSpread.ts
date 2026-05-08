// src/features/marketplace/components/consensus/useHeroSpread.ts
// maps aggregate bucketSpread into the cover's small spread histogram chip

import { useMemo } from 'react'

import type { MarketplaceTemplateRankingAggregate } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import { isTemplateRankingAggregateReady as isAggregateReady } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'

import { resolveBucketColor } from './utils'

interface HeroSpreadEntry
{
  index: number
  label: string
  color: string
  count: number
}

interface UseHeroSpreadArgs
{
  aggregate: MarketplaceTemplateRankingAggregate | null | undefined
}

export const useHeroSpread = ({
  aggregate,
}: UseHeroSpreadArgs): readonly HeroSpreadEntry[] | null =>
{
  const paletteId = usePreferencesStore((state) => state.paletteId)
  return useMemo<readonly HeroSpreadEntry[] | null>(() =>
  {
    if (!isAggregateReady(aggregate)) return null
    const counts = aggregate.bucketSpread
    if (counts.every((value) => value === 0)) return null
    return aggregate.buckets.map((bucket) => ({
      index: bucket.index,
      label: bucket.label,
      color: resolveBucketColor(bucket, paletteId),
      count: counts[bucket.index] ?? 0,
    }))
  }, [aggregate, paletteId])
}
