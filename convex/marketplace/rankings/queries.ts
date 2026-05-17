// convex/marketplace/rankings/queries.ts
// temporary public compatibility wrappers for pre-split ranking clients

import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { api } from '../../_generated/api'
import { query } from '../../_generated/server'
import type {
  MarketplaceMyRankingForTemplateResult,
  MarketplaceRankingDetail,
  MarketplaceRankingListResult,
  MarketplaceRankingPaginatedResult,
  MarketplaceRankingPublishAvailability,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import type {
  MarketplaceTemplateRankingAggregate,
  MarketplaceTemplateRankingAggregateItemsResult,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import {
  marketplaceMyRankingForTemplateResultValidator,
  marketplaceRankingDetailValidator,
  marketplaceRankingListResultValidator,
  marketplaceRankingPaginatedResultValidator,
  marketplaceRankingPublishAvailabilityValidator,
  marketplaceTemplateRankingAggregateItemsResultValidator,
  marketplaceTemplateRankingAggregateValidator,
  rankingListSortValidator,
  templateRankingAggregateItemBandValidator,
  templateRankingAggregateItemSortValidator,
} from '../../lib/validators/marketplace'

const rankingSortArg = v.optional(rankingListSortValidator)
const aggregateSortArg = v.optional(templateRankingAggregateItemSortValidator)
const aggregateBandArg = v.optional(templateRankingAggregateItemBandValidator)

export const getRankingBySlug = query({
  args: { slug: v.string() },
  returns: v.union(marketplaceRankingDetailValidator, v.null()),
  handler: async (ctx, args): Promise<MarketplaceRankingDetail | null> =>
  {
    const result: MarketplaceRankingDetail | null = await ctx.runQuery(
      api.marketplace.rankings.public.queries.getRankingBySlug,
      args
    )
    return result
  },
})

export const getRankingsForTemplate = query({
  args: {
    templateSlug: v.string(),
    limit: v.optional(v.number()),
    sort: rankingSortArg,
    criterionExternalId: v.optional(v.string()),
  },
  returns: marketplaceRankingListResultValidator,
  handler: async (ctx, args): Promise<MarketplaceRankingListResult> =>
  {
    const result: MarketplaceRankingListResult = await ctx.runQuery(
      api.marketplace.rankings.public.queries.getRankingsForTemplate,
      args
    )
    return result
  },
})

export const listRankingsForTemplate = query({
  args: {
    templateSlug: v.string(),
    paginationOpts: paginationOptsValidator,
    sort: rankingSortArg,
    criterionExternalId: v.optional(v.string()),
  },
  returns: marketplaceRankingPaginatedResultValidator,
  handler: async (ctx, args): Promise<MarketplaceRankingPaginatedResult> =>
  {
    const result: MarketplaceRankingPaginatedResult = await ctx.runQuery(
      api.marketplace.rankings.public.queries.listRankingsForTemplate,
      args
    )
    return result
  },
})

export const getTemplateRankingAggregate = query({
  args: {
    templateSlug: v.string(),
    criterionExternalId: v.optional(v.string()),
  },
  returns: v.union(marketplaceTemplateRankingAggregateValidator, v.null()),
  handler: async (
    ctx,
    args
  ): Promise<MarketplaceTemplateRankingAggregate | null> =>
  {
    const result: MarketplaceTemplateRankingAggregate | null =
      await ctx.runQuery(
        api.marketplace.rankings.public.queries.getTemplateRankingAggregate,
        args
      )
    return result
  },
})

export const listTemplateRankingAggregateItems = query({
  args: {
    templateSlug: v.string(),
    criterionExternalId: v.optional(v.string()),
    generation: v.number(),
    paginationOpts: paginationOptsValidator,
    sort: aggregateSortArg,
    band: aggregateBandArg,
    search: v.optional(v.union(v.string(), v.null())),
  },
  returns: marketplaceTemplateRankingAggregateItemsResultValidator,
  handler: async (
    ctx,
    args
  ): Promise<MarketplaceTemplateRankingAggregateItemsResult> =>
  {
    const result: MarketplaceTemplateRankingAggregateItemsResult =
      await ctx.runQuery(
        api.marketplace.rankings.public.queries
          .listTemplateRankingAggregateItems,
        args
      )
    return result
  },
})

export const getMyRankingForTemplate = query({
  args: {
    templateSlug: v.string(),
    criterionExternalId: v.optional(v.string()),
  },
  returns: marketplaceMyRankingForTemplateResultValidator,
  handler: async (
    ctx,
    args
  ): Promise<MarketplaceMyRankingForTemplateResult> =>
  {
    const result: MarketplaceMyRankingForTemplateResult = await ctx.runQuery(
      api.marketplace.rankings.public.queries.getMyRankingForTemplate,
      args
    )
    return result
  },
})

export const getMyRankings = query({
  args: { limit: v.optional(v.number()) },
  returns: marketplaceRankingListResultValidator,
  handler: async (ctx, args): Promise<MarketplaceRankingListResult> =>
  {
    const result: MarketplaceRankingListResult = await ctx.runQuery(
      api.marketplace.rankings.public.queries.getMyRankings,
      args
    )
    return result
  },
})

export const getBoardRankingPublishAvailability = query({
  args: {
    boardExternalId: v.string(),
    criterionExternalId: v.optional(v.string()),
  },
  returns: marketplaceRankingPublishAvailabilityValidator,
  handler: async (
    ctx,
    args
  ): Promise<MarketplaceRankingPublishAvailability> =>
  {
    const result: MarketplaceRankingPublishAvailability = await ctx.runQuery(
      api.marketplace.rankings.public.queries
        .getBoardRankingPublishAvailability,
      args
    )
    return result
  },
})
