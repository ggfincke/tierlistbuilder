// src/features/marketplace/data/rankingsRepository.ts
// Convex query/mutation adapters for the public ranking marketplace

import {
  useMutation,
  usePaginatedQuery,
  useQuery,
  type UsePaginatedQueryResult,
} from 'convex/react'
import { api } from '@convex/_generated/api'
import { DEFAULT_RANKING_LIST_LIMIT } from '@tierlistbuilder/contracts/marketplace/ranking'
import type {
  MarketplaceMyRankingForTemplateResult,
  MarketplaceRankingDetail,
  MarketplaceRankingListResult,
  MarketplaceRankingPublishAvailability,
  MarketplaceRankingPublishResult,
  MarketplaceRankingRemixResult,
  MarketplaceRankingSummary,
  RankingListSort,
  RankingVisibility,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import type {
  MarketplaceTemplateRankingAggregate,
  MarketplaceTemplateRankingAggregateItem,
  TemplateRankingAggregateItemBand,
  TemplateRankingAggregateItemSort,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import { DEFAULT_TEMPLATE_RANKING_AGGREGATE_ITEM_PAGE_SIZE } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import { getConvexClient } from '~/features/platform/sync/lib/convexClient'

// reactive ranking detail. read-only viewers don't need a snapshot since the
// page is the canonical surface & remix counts move live
export const useRankingBySlug = (
  slug: string | null | undefined
): MarketplaceRankingDetail | null | undefined =>
  useQuery(
    api.marketplace.rankings.queries.getRankingBySlug,
    typeof slug === 'string' && slug.length > 0 ? { slug } : 'skip'
  )

type RankingsForTemplatePageStatus =
  UsePaginatedQueryResult<MarketplaceRankingSummary>['status']

interface RankingsForTemplatePage
{
  items: MarketplaceRankingSummary[]
  status: RankingsForTemplatePageStatus
  loadMore: (count?: number) => void
}

interface PaginatedRankingsForTemplateArgs
{
  templateSlug: string | null | undefined
  sort?: RankingListSort
  enabled?: boolean
  pageSize?: number
}

export const usePaginatedRankingsForTemplate = ({
  templateSlug,
  sort = 'recent',
  enabled = true,
  pageSize = DEFAULT_RANKING_LIST_LIMIT,
}: PaginatedRankingsForTemplateArgs): RankingsForTemplatePage =>
{
  const args =
    enabled && typeof templateSlug === 'string' && templateSlug.length > 0
      ? { templateSlug, sort }
      : 'skip'
  const page = usePaginatedQuery(
    api.marketplace.rankings.queries.listRankingsForTemplate,
    args,
    { initialNumItems: pageSize }
  ) as UsePaginatedQueryResult<MarketplaceRankingSummary>
  return {
    items: page.results,
    status: page.status,
    loadMore: (count = pageSize) => page.loadMore(count),
  }
}

// reactive aggregate metadata — null while no row exists yet (pre-cron, or
// no public rankings); items load through the paginated hook below
export const useTemplateRankingAggregate = (
  templateSlug: string | null | undefined,
  enabled = true
): MarketplaceTemplateRankingAggregate | null | undefined =>
  useQuery(
    api.marketplace.rankings.queries.getTemplateRankingAggregate,
    enabled && typeof templateSlug === 'string' && templateSlug.length > 0
      ? { templateSlug }
      : 'skip'
  )

export type TemplateRankingAggregateItemsPageStatus =
  UsePaginatedQueryResult<MarketplaceTemplateRankingAggregateItem>['status']

interface TemplateRankingAggregateItemsPage
{
  items: MarketplaceTemplateRankingAggregateItem[]
  status: TemplateRankingAggregateItemsPageStatus
  loadMore: (count?: number) => void
}

interface TemplateRankingAggregateItemsArgs
{
  templateSlug: string | null | undefined
  generation: number | null | undefined
  sort?: TemplateRankingAggregateItemSort
  band?: TemplateRankingAggregateItemBand
  search?: string | null
  enabled?: boolean
  // override page size for surfaces that only need a few rows (eg the hero rail
  // cards that show top-3-by-controversy). defaults to 100
  pageSize?: number
}

// changing `sort` or `generation` re-keys the query & restarts pagination
// pass enabled=false to skip while the aggregate has no active generation
export const useTemplateRankingAggregateItems = ({
  templateSlug,
  generation,
  sort,
  band,
  search,
  enabled = true,
  pageSize = DEFAULT_TEMPLATE_RANKING_AGGREGATE_ITEM_PAGE_SIZE,
}: TemplateRankingAggregateItemsArgs): TemplateRankingAggregateItemsPage =>
{
  const args =
    enabled &&
    typeof templateSlug === 'string' &&
    templateSlug.length > 0 &&
    typeof generation === 'number'
      ? {
          templateSlug,
          generation,
          ...(sort ? { sort } : {}),
          ...(band ? { band } : {}),
          ...(search ? { search } : {}),
        }
      : 'skip'
  const page = usePaginatedQuery(
    api.marketplace.rankings.queries.listTemplateRankingAggregateItems,
    args,
    { initialNumItems: pageSize }
  ) as UsePaginatedQueryResult<MarketplaceTemplateRankingAggregateItem>
  return {
    items: page.results,
    status: page.status,
    loadMore: (count = pageSize) => page.loadMore(count),
  }
}

export const useMyRankingForTemplate = (
  templateSlug: string | null | undefined,
  enabled = true
): MarketplaceMyRankingForTemplateResult | undefined =>
  useQuery(
    api.marketplace.rankings.queries.getMyRankingForTemplate,
    enabled && typeof templateSlug === 'string' && templateSlug.length > 0
      ? { templateSlug }
      : 'skip'
  )

export const useMyRankings = (
  enabled: boolean,
  limit?: number
): MarketplaceRankingListResult | undefined =>
  useQuery(
    api.marketplace.rankings.queries.getMyRankings,
    enabled ? (limit === undefined ? {} : { limit }) : 'skip'
  )

export const useRankingPublishAvailability = (
  boardExternalId: string | null | undefined,
  enabled = true
): MarketplaceRankingPublishAvailability | undefined =>
  useQuery(
    api.marketplace.rankings.queries.getBoardRankingPublishAvailability,
    enabled && boardExternalId ? { boardExternalId } : 'skip'
  )

interface PublishRankingFromBoardArgs
{
  boardExternalId: string
  title?: string
  description?: string | null
  visibility: RankingVisibility
}

export const usePublishRankingFromBoardMutation = () =>
  useMutation(
    api.marketplace.rankings.mutations.publishRankingFromBoard
  ) as unknown as (
    args: PublishRankingFromBoardArgs
  ) => Promise<MarketplaceRankingPublishResult>

interface RemixRankingArgs
{
  slug: string
  title?: string
}

export const useRemixRankingMutation = () =>
  useMutation(api.marketplace.rankings.mutations.remixRanking) as unknown as (
    args: RemixRankingArgs
  ) => Promise<MarketplaceRankingRemixResult>

// imperative form — fire-&-forget once per ranking-detail session window
export const recordRankingViewImperative = (slug: string): Promise<null> =>
  getConvexClient().mutation(
    api.marketplace.rankings.mutations.recordRankingView,
    { slug }
  )
