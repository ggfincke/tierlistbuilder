// src/features/marketplace/model/detail/useHeroAggregate.ts
// cached aggregate fallback for the template hero rail

import type { MarketplaceTemplateRankingAggregate } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import { setMapEntryLru, touchMapEntry } from '~/shared/lib/lru'

const MAX_HERO_AGGREGATE_CACHE_ENTRIES = 32
const HERO_AGGREGATE_CACHE = new Map<
  string,
  MarketplaceTemplateRankingAggregate
>()

const readCachedHeroAggregate = (
  cacheKey: string
): MarketplaceTemplateRankingAggregate | null =>
{
  const cached = HERO_AGGREGATE_CACHE.get(cacheKey) ?? null
  if (cached) touchMapEntry(HERO_AGGREGATE_CACHE, cacheKey)
  return cached
}

const isSameHeroAggregate = (
  previous: MarketplaceTemplateRankingAggregate | null,
  next: MarketplaceTemplateRankingAggregate
): boolean =>
{
  if (previous === null) return false
  return (
    previous.criterion.externalId === next.criterion.externalId &&
    previous.state === next.state &&
    previous.activeGeneration === next.activeGeneration &&
    previous.rankingCount === next.rankingCount &&
    previous.itemCount === next.itemCount &&
    previous.computedAt === next.computedAt &&
    previous.staleAt === next.staleAt
  )
}

export const useHeroAggregate = (
  cacheKey: string,
  readyAggregate: MarketplaceTemplateRankingAggregate | null,
  useFallback: boolean
): MarketplaceTemplateRankingAggregate | null =>
{
  const cachedAggregate = readCachedHeroAggregate(cacheKey)
  if (
    readyAggregate !== null &&
    !isSameHeroAggregate(cachedAggregate, readyAggregate)
  )
  {
    setMapEntryLru(
      HERO_AGGREGATE_CACHE,
      cacheKey,
      readyAggregate,
      MAX_HERO_AGGREGATE_CACHE_ENTRIES
    )
  }

  return readyAggregate ?? (useFallback ? cachedAggregate : null)
}
