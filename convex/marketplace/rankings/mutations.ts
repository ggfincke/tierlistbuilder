// convex/marketplace/rankings/mutations.ts
// compatibility shim for ranking mutations from the old path

import { v } from 'convex/values'
import { internalMutation, mutation } from '../../_generated/server'
import { api, internal } from '../../_generated/api'
import type {
  MarketplaceRankingPublishResult,
  MarketplaceRankingRemixResult,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import {
  marketplaceRankingPublishResultValidator,
  marketplaceRankingRemixResultValidator,
  rankingFeaturedBadgeValidator,
  rankingVisibilityValidator,
} from '../../lib/validators/marketplace'

export const supersedePublicRankingsInLaneBatch = internalMutation({
  args: {
    ownerId: v.id('users'),
    templateId: v.id('templates'),
    criterionExternalId: v.string(),
    replacementRankingId: v.id('publishedRankings'),
    now: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const result: null = await ctx.runMutation(
      internal.marketplace.rankings.public.mutations
        .supersedePublicRankingsInLaneBatch,
      args
    )
    return result
  },
})

export const publishRankingFromBoard = mutation({
  args: {
    boardExternalId: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    visibility: rankingVisibilityValidator,
    criterionExternalId: v.optional(v.string()),
  },
  returns: marketplaceRankingPublishResultValidator,
  handler: async (ctx, args): Promise<MarketplaceRankingPublishResult> =>
  {
    const result: MarketplaceRankingPublishResult = await ctx.runMutation(
      api.marketplace.rankings.public.mutations.publishRankingFromBoard,
      args
    )
    return result
  },
})

export const remixTemplateConsensus = mutation({
  args: {
    templateSlug: v.string(),
    criterionExternalId: v.optional(v.string()),
    title: v.optional(v.string()),
  },
  returns: marketplaceRankingRemixResultValidator,
  handler: async (ctx, args): Promise<MarketplaceRankingRemixResult> =>
  {
    const result: MarketplaceRankingRemixResult = await ctx.runMutation(
      api.marketplace.rankings.public.mutations.remixTemplateConsensus,
      args
    )
    return result
  },
})

export const recordRankingView = mutation({
  args: { slug: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const result: null = await ctx.runMutation(
      api.marketplace.rankings.public.mutations.recordRankingView,
      args
    )
    return result
  },
})

export const markRankingFeaturedImpl = internalMutation({
  args: {
    slug: v.string(),
    featuredRank: v.number(),
    featuredBadge: rankingFeaturedBadgeValidator,
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const result: null = await ctx.runMutation(
      internal.marketplace.rankings.public.mutations.markRankingFeaturedImpl,
      args
    )
    return result
  },
})

export const unmarkRankingFeaturedImpl = internalMutation({
  args: { slug: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const result: null = await ctx.runMutation(
      internal.marketplace.rankings.public.mutations.unmarkRankingFeaturedImpl,
      args
    )
    return result
  },
})
