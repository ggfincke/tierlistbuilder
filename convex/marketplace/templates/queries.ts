// convex/marketplace/templates/queries.ts
// public template gallery/detail reads plus signed-in ownership listing

import { v } from 'convex/values'
import { query, type QueryCtx } from '../../_generated/server'
import type { Doc } from '../../_generated/dataModel'
import type {
  MarketplaceTemplateDetail,
  MarketplaceTemplateListResult,
  TemplateCategory,
  TemplateListSort,
} from '@tierlistbuilder/contracts/marketplace/template'
import { isTemplateSlug } from '@tierlistbuilder/contracts/marketplace/template'
import { getCurrentUserId } from '../../lib/auth'
import {
  marketplaceTemplateDetailValidator,
  marketplaceTemplateListResultValidator,
  templateCategoryValidator,
  templateListSortValidator,
} from '../../lib/validators'
import {
  findTemplateBySlug,
  normalizeListLimit,
  normalizeSearchQuery,
  toTemplateDetail,
  toTemplateSummary,
} from './lib'

const listCategoryArg = v.optional(v.union(templateCategoryValidator, v.null()))

const listSortArg = v.optional(templateListSortValidator)

const takePublicRows = async (
  ctx: QueryCtx,
  options: {
    category: TemplateCategory | null
    sort: TemplateListSort
    limit: number
  }
): Promise<Doc<'templates'>[]> =>
{
  if (options.sort === 'featured')
  {
    if (options.category)
    {
      return await ctx.db
        .query('templates')
        .withIndex('byCategoryVisibilityUnpublishedFeaturedRank', (q) =>
          q
            .eq('category', options.category!)
            .eq('visibility', 'public')
            .eq('unpublishedAt', null)
            .gt('featuredRank', -1)
        )
        .order('asc')
        .take(options.limit)
    }

    return await ctx.db
      .query('templates')
      .withIndex('byVisibilityUnpublishedFeaturedRank', (q) =>
        q
          .eq('visibility', 'public')
          .eq('unpublishedAt', null)
          .gt('featuredRank', -1)
      )
      .order('asc')
      .take(options.limit)
  }

  if (options.sort === 'popular')
  {
    if (options.category)
    {
      return await ctx.db
        .query('templates')
        .withIndex('byCategoryVisibilityUnpublishedUseCount', (q) =>
          q
            .eq('category', options.category!)
            .eq('visibility', 'public')
            .eq('unpublishedAt', null)
        )
        .order('desc')
        .take(options.limit)
    }

    return await ctx.db
      .query('templates')
      .withIndex('byVisibilityUnpublishedUseCount', (q) =>
        q.eq('visibility', 'public').eq('unpublishedAt', null)
      )
      .order('desc')
      .take(options.limit)
  }

  if (options.category)
  {
    return await ctx.db
      .query('templates')
      .withIndex('byCategoryVisibilityUnpublishedUpdatedAt', (q) =>
        q
          .eq('category', options.category!)
          .eq('visibility', 'public')
          .eq('unpublishedAt', null)
      )
      .order('desc')
      .take(options.limit)
  }

  return await ctx.db
    .query('templates')
    .withIndex('byVisibilityUnpublishedUpdatedAt', (q) =>
      q.eq('visibility', 'public').eq('unpublishedAt', null)
    )
    .order('desc')
    .take(options.limit)
}

const searchPublicRows = async (
  ctx: QueryCtx,
  options: {
    search: string
    category: TemplateCategory | null
    limit: number
  }
): Promise<Doc<'templates'>[]> =>
  await ctx.db
    .query('templates')
    .withSearchIndex('searchPublic', (q) =>
    {
      const base = q
        .search('searchText', options.search)
        .eq('visibility', 'public')
        .eq('unpublishedAt', null)

      return options.category ? base.eq('category', options.category) : base
    })
    .take(options.limit)

export const listTemplates = query({
  args: {
    search: v.optional(v.union(v.string(), v.null())),
    category: listCategoryArg,
    sort: listSortArg,
    limit: v.optional(v.number()),
  },
  returns: marketplaceTemplateListResultValidator,
  handler: async (ctx, args): Promise<MarketplaceTemplateListResult> =>
  {
    const limit = normalizeListLimit(args.limit)
    const category = args.category ?? null
    const search = normalizeSearchQuery(args.search)
    const sort = args.sort ?? 'recent'
    const rows = search
      ? await searchPublicRows(ctx, { search, category, limit })
      : await takePublicRows(ctx, { category, sort, limit })

    return {
      items: await Promise.all(rows.map((row) => toTemplateSummary(ctx, row))),
    }
  },
})

export const getTemplateBySlug = query({
  args: { slug: v.string() },
  returns: v.union(marketplaceTemplateDetailValidator, v.null()),
  handler: async (ctx, args): Promise<MarketplaceTemplateDetail | null> =>
  {
    if (!isTemplateSlug(args.slug))
    {
      return null
    }

    const template = await findTemplateBySlug(ctx, args.slug)
    if (!template || template.unpublishedAt !== null)
    {
      return null
    }

    return await toTemplateDetail(ctx, template)
  },
})

export const getMyTemplates = query({
  args: { limit: v.optional(v.number()) },
  returns: marketplaceTemplateListResultValidator,
  handler: async (ctx, args): Promise<MarketplaceTemplateListResult> =>
  {
    const userId = await getCurrentUserId(ctx)
    if (!userId)
    {
      return { items: [] }
    }

    const rows = await ctx.db
      .query('templates')
      .withIndex('byAuthorUpdatedAt', (q) => q.eq('authorId', userId))
      .order('desc')
      .take(normalizeListLimit(args.limit))

    return {
      items: await Promise.all(rows.map((row) => toTemplateSummary(ctx, row))),
    }
  },
})
