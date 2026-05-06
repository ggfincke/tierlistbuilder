// src/features/marketplace/data/rankingsRepository.ts
// Convex query/mutation adapters for the public ranking marketplace

import { useMutation, useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import type {
  MarketplaceRankingDetail,
  MarketplaceRankingListResult,
  MarketplaceRankingPublishAvailability,
  MarketplaceRankingPublishResult,
  MarketplaceRankingRemixResult,
  RankingVisibility,
} from '@tierlistbuilder/contracts/marketplace/ranking'
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

interface RankingsForTemplateArgs
{
  templateSlug: string
  limit?: number
}

export const useRankingsForTemplate = (
  args: RankingsForTemplateArgs | 'skip'
): MarketplaceRankingListResult | undefined =>
  useQuery(
    api.marketplace.rankings.queries.getRankingsForTemplate,
    args === 'skip' ? 'skip' : args
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

export interface PublishRankingFromBoardArgs
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

export interface RemixRankingArgs
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
