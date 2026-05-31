// src/features/marketplace/data/rankingsRepository.ts
// frontend-only ranking adapters for the extracted UI shell

import type {
  MarketplaceMyRankingForTemplateResult,
  MarketplaceRankingDetail,
  MarketplaceRankingListResult,
  MarketplaceRankingPublishAvailability,
  MarketplaceRankingPublishResult,
  MarketplaceRankingRemixResult,
  RankingListSort,
  RankingVisibility,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import type {
  MarketplaceTemplateRankingAggregate,
  MarketplaceTemplateRankingAggregateItem,
  TemplateRankingAggregateItemBand,
  TemplateRankingAggregateItemSort,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'

type MarketplacePage<T> = {
  items: T[]
  status: 'Exhausted' | 'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore'
  loadMore: (count?: number) => void
}

const EMPTY_PAGE: MarketplacePage<never> = {
  items: [],
  status: 'Exhausted',
  loadMore: () =>
  {},
}

const serviceUnavailable = async (): Promise<never> =>
{
  throw new Error('Ranking actions are not available in this UI-only build.')
}

export const useRankingBySlug = (
  _slug: string | null | undefined
): MarketplaceRankingDetail | null | undefined => null

export const getRankingBySlugImperative = (
  _slug: string
): Promise<MarketplaceRankingDetail | null> => Promise.resolve(null)

interface PaginatedRankingsForTemplateArgs
{
  templateSlug: string | null | undefined
  sort?: RankingListSort
  criterionExternalId?: string | null
  enabled?: boolean
  pageSize?: number
}

export const usePaginatedRankingsForTemplate = (
  _args: PaginatedRankingsForTemplateArgs
): MarketplacePage<MarketplaceRankingListResult['items'][number]> => EMPTY_PAGE

export const useTemplateRankingAggregate = (
  _templateSlug: string | null | undefined,
  _criterionExternalId?: string | null,
  _enabled = true
): MarketplaceTemplateRankingAggregate | null | undefined => null

interface TemplateRankingAggregateItemsArgs
{
  templateSlug: string | null | undefined
  criterionExternalId?: string | null
  generation: number | null | undefined
  sort?: TemplateRankingAggregateItemSort
  band?: TemplateRankingAggregateItemBand
  search?: string | null
  enabled?: boolean
  pageSize?: number
}

export const useTemplateRankingAggregateItems = (
  _args: TemplateRankingAggregateItemsArgs
): MarketplacePage<MarketplaceTemplateRankingAggregateItem> => EMPTY_PAGE

export type TemplateRankingAggregateItemsPageStatus = ReturnType<
  typeof useTemplateRankingAggregateItems
>['status']

export const useMyRankingForTemplate = (
  _templateSlug: string | null | undefined,
  _criterionExternalId?: string | null,
  _enabled = true
): MarketplaceMyRankingForTemplateResult | undefined => undefined

export const useMyRankings = (
  _enabled: boolean,
  _limit?: number
): MarketplaceRankingListResult | undefined => undefined

export const useRankingPublishAvailability = (
  _boardExternalId: string | null | undefined,
  _criterionExternalId?: string | null,
  _enabled = true
): MarketplaceRankingPublishAvailability | undefined => undefined

interface PublishRankingFromBoardArgs
{
  boardExternalId: string
  title?: string
  description?: string | null
  visibility: RankingVisibility
  criterionExternalId?: string
}

export const usePublishRankingFromBoardMutation =
  () =>
  (
    _args: PublishRankingFromBoardArgs
  ): Promise<MarketplaceRankingPublishResult> =>
    serviceUnavailable()

interface RemixTemplateConsensusArgs
{
  templateSlug: string
  criterionExternalId?: string
  title?: string
}

export const useRemixTemplateConsensusMutation =
  () =>
  (_args: RemixTemplateConsensusArgs): Promise<MarketplaceRankingRemixResult> =>
    serviceUnavailable()

export const recordRankingViewImperative = (_slug: string): Promise<null> =>
  Promise.resolve(null)
