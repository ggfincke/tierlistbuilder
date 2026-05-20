// packages/contracts/marketplace/rankingAggregate.ts
// public template-ranking consensus contracts shared by Convex & future UI

import type { TierColorSpec } from '../lib/theme'
import type { ImageFit, ItemTransform, MediaPlate } from '../workspace/board'
import type { TemplateCategory } from './category'
import type { TemplateMediaRef } from './template'
import type { PaginationResult } from '../lib/pagination'
import type { MarketplaceTemplateCriterion } from './templateCriterion'

export const TEMPLATE_RANKING_AGGREGATE_STATES = [
  'computing',
  'ready',
  'stale',
  'empty',
  'failed',
] as const

export type TemplateRankingAggregateState =
  (typeof TEMPLATE_RANKING_AGGREGATE_STATES)[number]

export const TEMPLATE_RANKING_AGGREGATE_ITEM_SORTS = [
  'templateOrder',
  'averageTop',
  'averageBottom',
  'consensus',
  'consensusTop',
  'controversy',
] as const

export type TemplateRankingAggregateItemSort =
  (typeof TEMPLATE_RANKING_AGGREGATE_ITEM_SORTS)[number]

export const TEMPLATE_RANKING_AGGREGATE_ITEM_BANDS = [
  'all',
  'top',
  'bottom',
  'controversial',
] as const

export type TemplateRankingAggregateItemBand =
  (typeof TEMPLATE_RANKING_AGGREGATE_ITEM_BANDS)[number]

export const DEFAULT_TEMPLATE_RANKING_AGGREGATE_ITEM_PAGE_SIZE = 100
export const MAX_TEMPLATE_RANKING_AGGREGATE_ITEM_PAGE_SIZE = 100
export const TEMPLATE_RANKING_AGGREGATE_TOP_BUCKET_MAX = 1
export const TEMPLATE_RANKING_AGGREGATE_BOTTOM_BUCKET_MIN = 4
export const MIN_RANKINGS_FOR_CONSENSUS_BOARD = 5
export const MIN_RANKINGS_FOR_CONTROVERSY_BADGES = 10
export const CONTROVERSY_PERCENTILE_MIN = 0.9

export const makeEmptyBucketSpread = (bucketCount: number): number[] =>
  Array.from({ length: Math.max(0, bucketCount) }, () => 0)

export const isTemplateRankingAggregateReady = (
  aggregate:
    | Pick<MarketplaceTemplateRankingAggregate, 'state'>
    | null
    | undefined
): aggregate is MarketplaceTemplateRankingAggregate =>
  aggregate !== null &&
  aggregate !== undefined &&
  (aggregate.state === 'ready' || aggregate.state === 'stale')

export interface MarketplaceTemplateRankingAggregateTemplateRef
{
  slug: string
  title: string
  category: TemplateCategory
  itemCount: number
}

export interface MarketplaceTemplateRankingAggregateBucket
{
  index: number
  label: string
  colorSpec: TierColorSpec | null
}

export interface MarketplaceTemplateRankingAggregateHighlight
{
  templateItemExternalId: string
  label: string | null
}

export interface MarketplaceTemplateRankingAggregate
{
  template: MarketplaceTemplateRankingAggregateTemplateRef
  criterion: MarketplaceTemplateCriterion
  state: TemplateRankingAggregateState
  activeGeneration: number | null
  bucketCount: number
  rankingCount: number
  itemCount: number
  computedAt: number | null
  staleAt: number | null
  buckets: MarketplaceTemplateRankingAggregateBucket[]
  bucketSpread: number[]
  mostAgreed: MarketplaceTemplateRankingAggregateHighlight | null
  mostDivisive: MarketplaceTemplateRankingAggregateHighlight | null
}

export interface MarketplaceTemplateRankingAggregateDistributionCell
{
  bucketIndex: number
  count: number
  share: number
}

export interface MarketplaceTemplateRankingAggregateItem
{
  externalId: string
  templateItemExternalId: string
  label: string | null
  backgroundColor: string | null
  mediaPlate: MediaPlate | null
  altText: string | null
  media: TemplateMediaRef | null
  order: number
  aspectRatio: number | null
  imageFit: ImageFit | null
  transform: ItemTransform | null
  imagePadding: number | null
  sampleCount: number
  averageBucket: number | null
  topBucketIndex: number | null
  topBucketShare: number
  consensusScore: number
  controversyScore: number
  controversyPercentile: number
  agreementPercentile: number
  isTopBucket: boolean
  isBottomBucket: boolean
  isControversial: boolean
  distribution: MarketplaceTemplateRankingAggregateDistributionCell[]
}

export type MarketplaceTemplateRankingAggregateItemsResult =
  PaginationResult<MarketplaceTemplateRankingAggregateItem>
