// src/features/marketplace/components/consensus/lib/activeRankingRows.ts
// project selected-ranking items into aggregate-row shape, then filter locally

import type { MarketplaceRankingItem } from '@tierlistbuilder/contracts/marketplace/ranking'
import {
  TEMPLATE_RANKING_AGGREGATE_BOTTOM_BUCKET_MIN,
  TEMPLATE_RANKING_AGGREGATE_TOP_BUCKET_MAX,
  type MarketplaceTemplateRankingAggregateItem,
  type TemplateRankingAggregateItemSort,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'

interface ActiveRankingFilterOptions
{
  bucketCount: number
  search: string
  sort: TemplateRankingAggregateItemSort
}

const makeDistribution = (
  bucketCount: number,
  activeBucketIndex: number | null
): MarketplaceTemplateRankingAggregateItem['distribution'] =>
  Array.from({ length: Math.max(0, bucketCount) }, (_, bucketIndex) => ({
    bucketIndex,
    count: bucketIndex === activeBucketIndex ? 1 : 0,
    share: bucketIndex === activeBucketIndex ? 1 : 0,
  }))

const activeTopBucketMax = (bucketCount: number): number =>
  Math.min(
    TEMPLATE_RANKING_AGGREGATE_TOP_BUCKET_MAX,
    Math.max(0, bucketCount - 1)
  )

const activeBottomBucketMin = (bucketCount: number): number =>
{
  if (bucketCount <= TEMPLATE_RANKING_AGGREGATE_BOTTOM_BUCKET_MIN)
  {
    return Math.max(0, bucketCount - 1)
  }
  return Math.max(0, bucketCount - 2)
}

export const buildRowsForActiveRanking = (
  items: readonly MarketplaceRankingItem[],
  placements: Record<string, number>,
  bucketCount: number
): MarketplaceTemplateRankingAggregateItem[] =>
  items
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((item) =>
    {
      const bucketIndex = placements[item.templateItemExternalId] ?? null
      const isRanked = bucketIndex !== null
      return {
        externalId: item.templateItemExternalId,
        templateItemExternalId: item.templateItemExternalId,
        label: item.label,
        backgroundColor: item.backgroundColor,
        mediaPlate: item.mediaPlate,
        altText: item.altText,
        media: item.media,
        order: item.order,
        aspectRatio: item.aspectRatio,
        imageFit: item.imageFit,
        transform: item.transform,
        sampleCount: isRanked ? 1 : 0,
        averageBucket: bucketIndex,
        topBucketIndex: bucketIndex,
        topBucketShare: isRanked ? 1 : 0,
        consensusScore: isRanked ? 1 : 0,
        controversyScore: 0,
        controversyPercentile: 0,
        agreementPercentile: isRanked ? 1 : 0,
        isTopBucket:
          bucketIndex !== null &&
          bucketIndex <= activeTopBucketMax(bucketCount),
        isBottomBucket:
          bucketIndex !== null &&
          bucketIndex >= activeBottomBucketMin(bucketCount),
        isControversial: false,
        distribution: makeDistribution(bucketCount, bucketIndex),
      }
    })

const matchesSortFilter = (
  row: MarketplaceTemplateRankingAggregateItem,
  sort: TemplateRankingAggregateItemSort
): boolean =>
{
  if (sort === 'consensusTop') return row.isTopBucket
  return true
}

const matchesSearch = (
  row: MarketplaceTemplateRankingAggregateItem,
  query: string
): boolean =>
{
  if (!query) return true
  return [row.label, row.templateItemExternalId, row.altText]
    .filter((value): value is string => typeof value === 'string')
    .some((value) => value.toLowerCase().includes(query))
}

const activeSortValue = (
  row: MarketplaceTemplateRankingAggregateItem,
  sort: TemplateRankingAggregateItemSort,
  bucketCount: number
): number =>
{
  const unsampled = bucketCount + 1
  if (sort === 'averageTop') return row.averageBucket ?? unsampled
  if (sort === 'averageBottom') return -(row.averageBucket ?? -unsampled)
  if (sort === 'consensus' || sort === 'consensusTop')
  {
    return row.sampleCount > 0 ? -row.topBucketShare : unsampled
  }
  if (sort === 'controversy') return -row.controversyScore
  return row.order
}

export const filterAndSortActiveRankingRows = (
  rows: readonly MarketplaceTemplateRankingAggregateItem[],
  options: ActiveRankingFilterOptions
): MarketplaceTemplateRankingAggregateItem[] =>
{
  const query = options.search.trim().toLowerCase()
  return rows
    .filter(
      (row) => matchesSortFilter(row, options.sort) && matchesSearch(row, query)
    )
    .sort(
      (a, b) =>
        activeSortValue(a, options.sort, options.bucketCount) -
          activeSortValue(b, options.sort, options.bucketCount) ||
        a.order - b.order ||
        a.templateItemExternalId.localeCompare(b.templateItemExternalId)
    )
}
