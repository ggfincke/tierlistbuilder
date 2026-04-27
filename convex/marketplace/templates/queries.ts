// convex/marketplace/templates/queries.ts
// public template gallery/detail reads plus signed-in ownership listing

import { v } from 'convex/values'
import { query, type QueryCtx } from '../../_generated/server'
import type { Doc } from '../../_generated/dataModel'
import type {
  MarketplaceTemplateDetail,
  MarketplaceTemplateDraftListResult,
  MarketplaceTemplateListResult,
  TemplateCategory,
  TemplateListSort,
} from '@tierlistbuilder/contracts/marketplace/template'
import {
  MAX_TEMPLATE_LIST_LIMIT,
  isTemplateSlug,
} from '@tierlistbuilder/contracts/marketplace/template'
import { getCurrentUserId } from '../../lib/auth'
import {
  marketplaceTemplateDetailValidator,
  marketplaceTemplateDraftListResultValidator,
  marketplaceTemplateListResultValidator,
  templateCategoryValidator,
  templateListSortValidator,
} from '../../lib/validators'
import {
  createTemplateProjectionCache,
  findTemplateBySlug,
  normalizeDraftLimit,
  normalizeListLimit,
  normalizeSearchQuery,
  normalizeTagArg,
  readPublicTemplateStats,
  toTemplateDetail,
  toTemplateDraft,
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

// handle search & tag together by over-fetching search results.
// seed an id Set from templateTags for the active tag.
// keep accuracy bounded to the search-index relevance window.
const SEARCH_AND_TAG_OVERFETCH = MAX_TEMPLATE_LIST_LIMIT * 4
const TAG_INTERSECT_ID_CAP = 512

const searchPublicRows = async (
  ctx: QueryCtx,
  options: {
    search: string
    category: TemplateCategory | null
    tag: string | null
    limit: number
  }
): Promise<Doc<'templates'>[]> =>
{
  const tag = options.tag

  let tagIdSet: Set<string> | null = null
  if (tag)
  {
    const tagRows = options.category
      ? await ctx.db
          .query('templateTags')
          .withIndex('byCategoryTagVisibilityUnpublishedUpdatedAt', (q) =>
            q
              .eq('category', options.category!)
              .eq('tag', tag)
              .eq('visibility', 'public')
              .eq('unpublishedAt', null)
          )
          .take(TAG_INTERSECT_ID_CAP)
      : await ctx.db
          .query('templateTags')
          .withIndex('byTagVisibilityUnpublishedUpdatedAt', (q) =>
            q
              .eq('tag', tag)
              .eq('visibility', 'public')
              .eq('unpublishedAt', null)
          )
          .take(TAG_INTERSECT_ID_CAP)
    if (tagRows.length === 0) return []
    tagIdSet = new Set(tagRows.map((row) => row.templateId as string))
  }

  const searchLimit = tag ? SEARCH_AND_TAG_OVERFETCH : options.limit
  const rows = await ctx.db
    .query('templates')
    .withSearchIndex('searchPublic', (q) =>
    {
      const base = q
        .search('searchText', options.search)
        .eq('visibility', 'public')
        .eq('unpublishedAt', null)

      return options.category ? base.eq('category', options.category) : base
    })
    .take(searchLimit)

  const filteredRows = tagIdSet
    ? rows.filter((row) => tagIdSet!.has(row._id as string))
    : rows
  return filteredRows.slice(0, options.limit)
}

// resolve tag-filtered template rows via the normalized templateTags table,
// ordered by tag-row updatedAt desc. denormalized visibility/category fields
// keep templates dropped from public view out of the join
const takePublicRowsByTag = async (
  ctx: QueryCtx,
  options: {
    tag: string
    category: TemplateCategory | null
    limit: number
  }
): Promise<Doc<'templates'>[]> =>
{
  const tagRows = options.category
    ? await ctx.db
        .query('templateTags')
        .withIndex('byCategoryTagVisibilityUnpublishedUpdatedAt', (q) =>
          q
            .eq('category', options.category!)
            .eq('tag', options.tag)
            .eq('visibility', 'public')
            .eq('unpublishedAt', null)
        )
        .order('desc')
        .take(options.limit)
    : await ctx.db
        .query('templateTags')
        .withIndex('byTagVisibilityUnpublishedUpdatedAt', (q) =>
          q
            .eq('tag', options.tag)
            .eq('visibility', 'public')
            .eq('unpublishedAt', null)
        )
        .order('desc')
        .take(options.limit)

  const templates = await Promise.all(
    tagRows.map((row) => ctx.db.get(row.templateId))
  )
  return templates.filter(
    (template): template is Doc<'templates'> => template !== null
  )
}

export const getPublicTemplateCount = query({
  args: {},
  returns: v.object({
    count: v.number(),
    countByCategory: v.record(v.string(), v.number()),
  }),
  handler: async (ctx) =>
  {
    const stats = await readPublicTemplateStats(ctx)
    return {
      count: stats.count,
      countByCategory: stats.countByCategory,
    }
  },
})

export const listTemplates = query({
  args: {
    search: v.optional(v.union(v.string(), v.null())),
    category: listCategoryArg,
    tag: v.optional(v.union(v.string(), v.null())),
    sort: listSortArg,
    limit: v.optional(v.number()),
  },
  returns: marketplaceTemplateListResultValidator,
  handler: async (ctx, args): Promise<MarketplaceTemplateListResult> =>
  {
    const limit = normalizeListLimit(args.limit)
    const category = args.category ?? null
    const search = normalizeSearchQuery(args.search)
    const tag = normalizeTagArg(args.tag)
    const sort = args.sort ?? 'recent'

    // Search keeps relevance ordering; tag membership narrows the result set
    // after the search-index read because searchPublic can't join templateTags.
    const rows = search
      ? await searchPublicRows(ctx, { search, category, tag, limit })
      : tag
        ? await takePublicRowsByTag(ctx, { tag, category, limit })
        : await takePublicRows(ctx, { category, sort, limit })

    const cache = createTemplateProjectionCache()
    return {
      items: await Promise.all(
        rows.map((row) => toTemplateSummary(ctx, row, cache))
      ),
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

    const cache = createTemplateProjectionCache()
    return await toTemplateDetail(ctx, template, cache)
  },
})

// related-templates rail on the detail page — same category, top use count,
// excluding the current slug. category is derived from the looked-up template
// row to avoid stale client args
const DEFAULT_RELATED_LIMIT = 4
const MAX_RELATED_LIMIT = 12

export const getRelatedTemplates = query({
  args: {
    slug: v.string(),
    limit: v.optional(v.number()),
  },
  returns: marketplaceTemplateListResultValidator,
  handler: async (ctx, args): Promise<MarketplaceTemplateListResult> =>
  {
    if (!isTemplateSlug(args.slug))
    {
      return { items: [] }
    }
    const template = await findTemplateBySlug(ctx, args.slug)
    if (!template || template.unpublishedAt !== null)
    {
      return { items: [] }
    }

    const limit = Math.max(
      1,
      Math.min(MAX_RELATED_LIMIT, args.limit ?? DEFAULT_RELATED_LIMIT)
    )
    const rows = await ctx.db
      .query('templates')
      .withIndex('byCategoryVisibilityUnpublishedUseCount', (q) =>
        q
          .eq('category', template.category)
          .eq('visibility', 'public')
          .eq('unpublishedAt', null)
      )
      .order('desc')
      .take(limit + 1)

    const filtered = rows
      .filter((row) => row.slug !== args.slug)
      .slice(0, limit)

    const cache = createTemplateProjectionCache()
    return {
      items: await Promise.all(
        filtered.map((row) => toTemplateSummary(ctx, row, cache))
      ),
    }
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

    const cache = createTemplateProjectionCache()
    return {
      items: await Promise.all(
        rows.map((row) => toTemplateSummary(ctx, row, cache))
      ),
    }
  },
})

export const getMyTemplateDrafts = query({
  args: { limit: v.optional(v.number()) },
  returns: marketplaceTemplateDraftListResultValidator,
  handler: async (ctx, args): Promise<MarketplaceTemplateDraftListResult> =>
  {
    const userId = await getCurrentUserId(ctx)
    if (!userId)
    {
      return { drafts: [] }
    }

    const rows = await ctx.db
      .query('boards')
      .withIndex('byOwnerDeletedTemplateProgressUpdatedAt', (q) =>
        q
          .eq('ownerId', userId)
          .eq('deletedAt', null)
          .eq('templateProgressState', 'in-progress')
      )
      .order('desc')
      .take(normalizeDraftLimit(args.limit))

    const templateIds = [
      ...new Set(
        rows
          .map((board) => board.sourceTemplateId)
          .filter((id): id is NonNullable<typeof id> => id !== null)
      ),
    ]
    const templateEntries = await Promise.all(
      templateIds.map(
        async (templateId) =>
          [templateId, await ctx.db.get(templateId)] as const
      )
    )
    const templatesById = new Map(templateEntries)
    const cache = createTemplateProjectionCache()
    const drafts = await Promise.all(
      rows.map(async (board) =>
      {
        if (board.sourceTemplateId === null)
        {
          return null
        }
        const template = templatesById.get(board.sourceTemplateId)
        return template
          ? await toTemplateDraft(ctx, board, template, cache)
          : null
      })
    )

    return { drafts: drafts.filter((draft) => draft !== null) }
  },
})
