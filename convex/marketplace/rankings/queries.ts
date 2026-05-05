// convex/marketplace/rankings/queries.ts
// public ranking detail/list reads plus signed-in owner listing

import { v } from 'convex/values'
import { query } from '../../_generated/server'
import type {
  MarketplaceRankingDetail,
  MarketplaceRankingListResult,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import { isRankingSlug } from '@tierlistbuilder/contracts/marketplace/ranking'
import {
  marketplaceRankingDetailValidator,
  marketplaceRankingListResultValidator,
} from '../../lib/validators'
import { getCurrentUserId } from '../../lib/auth'
import { isTemplateSlug } from '@tierlistbuilder/contracts/marketplace/template'
import { findTemplateBySlug } from '../templates/lib'
import {
  findRankingBySlug,
  isPublicRankingRow,
  isPublishedRankingRow,
  normalizeRankingLimit,
  toRankingDetail,
  toRankingSummary,
} from './lib'

export const getRankingBySlug = query({
  args: { slug: v.string() },
  returns: v.union(marketplaceRankingDetailValidator, v.null()),
  handler: async (ctx, args): Promise<MarketplaceRankingDetail | null> =>
  {
    if (!isRankingSlug(args.slug))
    {
      return null
    }

    const ranking = await findRankingBySlug(ctx, args.slug)
    if (!ranking || !isPublishedRankingRow(ranking))
    {
      return null
    }
    return await toRankingDetail(ctx, ranking)
  },
})

export const getRankingsForTemplate = query({
  args: { templateSlug: v.string(), limit: v.optional(v.number()) },
  returns: marketplaceRankingListResultValidator,
  handler: async (ctx, args): Promise<MarketplaceRankingListResult> =>
  {
    if (!isTemplateSlug(args.templateSlug))
    {
      return { items: [] }
    }
    const template = await findTemplateBySlug(ctx, args.templateSlug)
    if (!template)
    {
      return { items: [] }
    }

    const rows = await ctx.db
      .query('publishedRankings')
      .withIndex('bySourceTemplatePublicUpdatedAt', (q) =>
        q.eq('sourceTemplateId', template._id).eq('isPubliclyListable', true)
      )
      .order('desc')
      .take(normalizeRankingLimit(args.limit))
    const publicRows = rows.filter(isPublicRankingRow)
    return {
      items: await Promise.all(
        publicRows.map((row) => toRankingSummary(ctx, row))
      ),
    }
  },
})

export const getMyRankings = query({
  args: { limit: v.optional(v.number()) },
  returns: marketplaceRankingListResultValidator,
  handler: async (ctx, args): Promise<MarketplaceRankingListResult> =>
  {
    const userId = await getCurrentUserId(ctx)
    if (!userId)
    {
      return { items: [] }
    }

    const rows = await ctx.db
      .query('publishedRankings')
      .withIndex('byOwnerUpdatedAt', (q) => q.eq('ownerId', userId))
      .order('desc')
      .take(normalizeRankingLimit(args.limit))
    return {
      items: await Promise.all(rows.map((row) => toRankingSummary(ctx, row))),
    }
  },
})
