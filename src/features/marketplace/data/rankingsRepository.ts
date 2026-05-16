// src/features/marketplace/data/rankingsRepository.ts
// Convex query/mutation adapters for the public ranking marketplace

import {
  useMutation,
  usePaginatedQuery,
  useQuery,
  type UsePaginatedQueryResult,
} from 'convex/react'
import { useCallback, useMemo } from 'react'
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

// imperative variant used by the local-remix flow when the caller doesn't
// have a reactive subscription handy (eg signed-out remix CTAs that don't
// keep the detail query live across the click)
export const getRankingBySlugImperative = (
  slug: string
): Promise<MarketplaceRankingDetail | null> =>
  getConvexClient().query(api.marketplace.rankings.queries.getRankingBySlug, {
    slug,
  })

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
  // when omitted, the backend lists rankings across every criterion; pass
  // an external id to scope the rail to a single lane
  criterionExternalId?: string | null
  enabled?: boolean
  pageSize?: number
}

export const usePaginatedRankingsForTemplate = ({
  templateSlug,
  sort = 'recent',
  criterionExternalId,
  enabled = true,
  pageSize = DEFAULT_RANKING_LIST_LIMIT,
}: PaginatedRankingsForTemplateArgs): RankingsForTemplatePage =>
{
  const args = useMemo(
    () =>
      enabled && typeof templateSlug === 'string' && templateSlug.length > 0
        ? {
            templateSlug,
            sort,
            ...(criterionExternalId ? { criterionExternalId } : {}),
          }
        : 'skip',
    [criterionExternalId, enabled, sort, templateSlug]
  )
  const page = usePaginatedQuery(
    api.marketplace.rankings.queries.listRankingsForTemplate,
    args,
    { initialNumItems: pageSize }
  ) as UsePaginatedQueryResult<MarketplaceRankingSummary>
  const { results, status, loadMore: pageLoadMore } = page
  const loadMore = useCallback(
    (count = pageSize) => pageLoadMore(count),
    [pageLoadMore, pageSize]
  )
  return useMemo(
    () => ({ items: results, status, loadMore }),
    [loadMore, results, status]
  )
}

// reactive aggregate metadata — null while no row exists yet (pre-cron, or
// no public rankings); items load through the paginated hook below; pass
// criterionExternalId to scope a non-primary lane (omit = primary)
export const useTemplateRankingAggregate = (
  templateSlug: string | null | undefined,
  criterionExternalId?: string | null,
  enabled = true
): MarketplaceTemplateRankingAggregate | null | undefined =>
  useQuery(
    api.marketplace.rankings.queries.getTemplateRankingAggregate,
    enabled && typeof templateSlug === 'string' && templateSlug.length > 0
      ? {
          templateSlug,
          ...(criterionExternalId ? { criterionExternalId } : {}),
        }
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
  // criterion lane — must match the lane whose generation is being read.
  // omit to default to the active primary criterion (& its generation)
  criterionExternalId?: string | null
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
  criterionExternalId,
  generation,
  sort,
  band,
  search,
  enabled = true,
  pageSize = DEFAULT_TEMPLATE_RANKING_AGGREGATE_ITEM_PAGE_SIZE,
}: TemplateRankingAggregateItemsArgs): TemplateRankingAggregateItemsPage =>
{
  const args = useMemo(
    () =>
      enabled &&
      typeof templateSlug === 'string' &&
      templateSlug.length > 0 &&
      typeof generation === 'number'
        ? {
            templateSlug,
            generation,
            ...(criterionExternalId ? { criterionExternalId } : {}),
            ...(sort ? { sort } : {}),
            ...(band ? { band } : {}),
            ...(search ? { search } : {}),
          }
        : 'skip',
    [band, criterionExternalId, enabled, generation, search, sort, templateSlug]
  )
  const page = usePaginatedQuery(
    api.marketplace.rankings.queries.listTemplateRankingAggregateItems,
    args,
    { initialNumItems: pageSize }
  ) as UsePaginatedQueryResult<MarketplaceTemplateRankingAggregateItem>
  const { results, status, loadMore: pageLoadMore } = page
  const loadMore = useCallback(
    (count = pageSize) => pageLoadMore(count),
    [pageLoadMore, pageSize]
  )
  return useMemo(
    () => ({ items: results, status, loadMore }),
    [loadMore, results, status]
  )
}

export const useMyRankingForTemplate = (
  templateSlug: string | null | undefined,
  criterionExternalId?: string | null,
  enabled = true
): MarketplaceMyRankingForTemplateResult | undefined =>
  useQuery(
    api.marketplace.rankings.queries.getMyRankingForTemplate,
    enabled && typeof templateSlug === 'string' && templateSlug.length > 0
      ? {
          templateSlug,
          ...(criterionExternalId ? { criterionExternalId } : {}),
        }
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

// reactive publish gate; pass criterionExternalId to surface lane-scoped
// block reasons (`criterion_not_found` / `criterion_not_publishable`)
export const useRankingPublishAvailability = (
  boardExternalId: string | null | undefined,
  criterionExternalId?: string | null,
  enabled = true
): MarketplaceRankingPublishAvailability | undefined =>
  useQuery(
    api.marketplace.rankings.queries.getBoardRankingPublishAvailability,
    enabled && boardExternalId
      ? {
          boardExternalId,
          ...(criterionExternalId ? { criterionExternalId } : {}),
        }
      : 'skip'
  )

interface PublishRankingFromBoardArgs
{
  boardExternalId: string
  title?: string
  description?: string | null
  visibility: RankingVisibility
  // criterion lane this ranking answers; omit to default to the template's
  // active primary criterion server-side
  criterionExternalId?: string
}

export const usePublishRankingFromBoardMutation = () =>
  useMutation(
    api.marketplace.rankings.mutations.publishRankingFromBoard
  ) as unknown as (
    args: PublishRankingFromBoardArgs
  ) => Promise<MarketplaceRankingPublishResult>

interface RemixTemplateConsensusArgs
{
  templateSlug: string
  criterionExternalId?: string
  title?: string
}

export const useRemixTemplateConsensusMutation = () =>
  useMutation(
    api.marketplace.rankings.mutations.remixTemplateConsensus
  ) as unknown as (
    args: RemixTemplateConsensusArgs
  ) => Promise<MarketplaceRankingRemixResult>

// imperative form — fire-&-forget once per ranking-detail session window
export const recordRankingViewImperative = (slug: string): Promise<null> =>
  getConvexClient().mutation(
    api.marketplace.rankings.mutations.recordRankingView,
    { slug }
  )
