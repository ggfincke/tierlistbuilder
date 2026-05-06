// packages/contracts/marketplace/rankingAggregate.ts
// public template-ranking consensus contracts shared by Convex & future UI

import type { TierColorSpec } from '../lib/theme'
import type { ImageFit, ItemTransform } from '../workspace/board'
import type { TemplateCategory } from './category'
import type { TemplateMediaRef } from './template'
import type { PaginationResult } from '../lib/pagination'

export const TEMPLATE_RANKING_AGGREGATE_STATES = [
  'computing',
  'ready',
  'stale',
  'empty',
] as const

export type TemplateRankingAggregateState =
  (typeof TEMPLATE_RANKING_AGGREGATE_STATES)[number]

export const TEMPLATE_RANKING_AGGREGATE_ITEM_SORTS = [
  'templateOrder',
  'averageTop',
  'averageBottom',
  'consensus',
  'controversy',
] as const

export type TemplateRankingAggregateItemSort =
  (typeof TEMPLATE_RANKING_AGGREGATE_ITEM_SORTS)[number]

export const DEFAULT_TEMPLATE_RANKING_AGGREGATE_ITEM_PAGE_SIZE = 50
export const MAX_TEMPLATE_RANKING_AGGREGATE_ITEM_PAGE_SIZE = 100

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

export interface MarketplaceTemplateRankingAggregate
{
  template: MarketplaceTemplateRankingAggregateTemplateRef
  state: TemplateRankingAggregateState
  activeGeneration: number | null
  bucketCount: number
  rankingCount: number
  itemCount: number
  computedAt: number | null
  staleAt: number | null
  buckets: MarketplaceTemplateRankingAggregateBucket[]
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
  altText: string | null
  media: TemplateMediaRef | null
  order: number
  aspectRatio: number | null
  imageFit: ImageFit | null
  transform: ItemTransform | null
  sampleCount: number
  averageBucket: number | null
  topBucketIndex: number | null
  topBucketShare: number
  consensusScore: number
  controversyScore: number
  distribution: MarketplaceTemplateRankingAggregateDistributionCell[]
}

export type MarketplaceTemplateRankingAggregateItemsResult =
  PaginationResult<MarketplaceTemplateRankingAggregateItem>
