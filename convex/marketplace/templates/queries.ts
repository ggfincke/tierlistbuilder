// convex/marketplace/templates/queries.ts
// public template gallery/detail reads plus signed-in ownership listing

import { v } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import { query, type QueryCtx } from '../../_generated/server'
import type { Doc } from '../../_generated/dataModel'
import { clamp } from '@tierlistbuilder/contracts/lib/math'
import type {
  MarketplaceTemplateDetail,
  MarketplaceTemplateDraftListResult,
  MarketplaceTemplateGalleryCard,
  MarketplaceTemplateGalleryRailResult,
  MarketplaceTemplateGalleryResult,
  MarketplaceTemplateGalleryResultsResult,
  MarketplaceTemplateItemsResult,
  MarketplaceTemplateCloneJobProgress,
  MarketplaceTemplateListResult,
  MarketplaceTemplateManagementListResult,
  MarketplaceTemplatePublishJobProgress,
  TemplateGalleryRail,
  TemplateListSort,
} from '@tierlistbuilder/contracts/marketplace/template'
import type { UserPlan } from '@tierlistbuilder/contracts/platform/user'
import type { TemplateCategory } from '@tierlistbuilder/contracts/marketplace/category'
import {
  DEFAULT_TEMPLATE_ITEM_PAGE_SIZE,
  MAX_TEMPLATE_ITEM_PAGE_SIZE,
  MAX_TEMPLATE_LIST_LIMIT,
  isTemplateSlug,
} from '@tierlistbuilder/contracts/marketplace/template'
import { getCurrentUser, getCurrentUserId } from '../../lib/auth'
import {
  marketplaceTemplateGalleryResultValidator,
  marketplaceTemplateGalleryRailResultValidator,
  marketplaceTemplateGalleryResultsResultValidator,
  marketplaceTemplateCloneJobProgressValidator,
  marketplaceTemplateDetailValidator,
  marketplaceTemplateDraftListResultValidator,
  marketplaceTemplateItemsResultValidator,
  marketplaceTemplateListResultValidator,
  marketplaceTemplateManagementListResultValidator,
  marketplaceTemplatePublishJobProgressValidator,
  templateCategoryValidator,
  templateGalleryRailValidator,
  templateListSortValidator,
} from '../../lib/validators/marketplace'
import { createTemplateProjectionCache } from './lib/trending'
import {
  findTemplateBySlug,
  findTemplateCardByTemplateId,
  readPublicTemplateStats,
  toTemplateCardSummary,
  toTemplateDetail,
  toTemplateDraft,
  toTemplateItem,
} from './lib/projections'
import {
  normalizeDraftLimit,
  normalizeListLimit,
  normalizeSearchQuery,
  normalizeTagArg,
} from './lib/normalize'
import { getTemplateAccessState, isPublishedTemplateRow } from './lib/state'
import { getBoardSourceTemplateId } from '../../workspace/boards/sourceFields'
import { failInput } from '../../lib/text'

const listCategoryArg = v.optional(v.union(templateCategoryValidator, v.null()))

const listSortArg = v.optional(templateListSortValidator)

const FEATURED_LIMIT = 6
const RAIL_LIMIT = 12

const TEMPLATE_GALLERY_RAIL_SORT: Record<
  TemplateGalleryRail,
  TemplateListSort
> = {
  featured: 'featured',
  trending: 'trending',
  popular: 'popular',
  recent: 'recent',
}

const defaultGalleryRailLimit = (rail: TemplateGalleryRail): number =>
  rail === 'featured' ? FEATURED_LIMIT : RAIL_LIMIT

const normalizeTemplateItemPageSize = (raw: number): number =>
{
  if (!Number.isFinite(raw)) return DEFAULT_TEMPLATE_ITEM_PAGE_SIZE
  return clamp(Math.floor(raw), 1, MAX_TEMPLATE_ITEM_PAGE_SIZE)
}

const emptyTemplateItemsResult = (
  cursor: string | null
): MarketplaceTemplateItemsResult => ({
  page: [],
  isDone: true,
  continueCursor: cursor ?? '',
})

const toBaseJobProgress = (
  job: Doc<'templatePublishJobs'> | Doc<'templateCloneJobs'>
) => ({
  jobId: job._id,
  status: job.status,
  itemCount: job.itemCount,
  processedItemCount: job.processedItemCount,
  errorCode: job.errorCode,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
  startedAt: job.startedAt,
  completedAt: job.completedAt,
  canceledAt: job.canceledAt,
})

const toPublishJobProgress = async (
  ctx: QueryCtx,
  job: Doc<'templatePublishJobs'>
): Promise<MarketplaceTemplatePublishJobProgress | null> =>
{
  const template = await ctx.db.get(job.targetTemplateId)
  if (!template) return null
  return {
    kind: 'publish',
    ...toBaseJobProgress(job),
    slug: template.slug,
  }
}

const toCloneJobProgress = async (
  ctx: QueryCtx,
  job: Doc<'templateCloneJobs'>
): Promise<MarketplaceTemplateCloneJobProgress | null> =>
{
  const board = await ctx.db.get(job.targetBoardId)
  if (!board) return null
  return {
    kind: 'clone',
    ...toBaseJobProgress(job),
    boardExternalId: board.externalId,
  }
}

const takePublicRows = async (
  ctx: QueryCtx,
  options: {
    category: TemplateCategory | null
    sort: TemplateListSort
    limit: number
  }
): Promise<Doc<'templateCards'>[]> =>
{
  if (options.sort === 'featured')
  {
    if (options.category)
    {
      return await ctx.db
        .query('templateCards')
        .withIndex('byCategoryIsPubliclyListableFeaturedRank', (q) =>
          q
            .eq('category', options.category!)
            .eq('isPubliclyListable', true)
            .gt('featuredRank', -1)
        )
        .order('asc')
        .take(options.limit)
    }

    return await ctx.db
      .query('templateCards')
      .withIndex('byIsPubliclyListableFeaturedRank', (q) =>
        q.eq('isPubliclyListable', true).gt('featuredRank', -1)
      )
      .order('asc')
      .take(options.limit)
  }

  if (options.sort === 'popular')
  {
    if (options.category)
    {
      return await ctx.db
        .query('templateCards')
        .withIndex('byCategoryIsPubliclyListableForkCount', (q) =>
          q.eq('category', options.category!).eq('isPubliclyListable', true)
        )
        .order('desc')
        .take(options.limit)
    }

    return await ctx.db
      .query('templateCards')
      .withIndex('byIsPubliclyListableForkCount', (q) =>
        q.eq('isPubliclyListable', true)
      )
      .order('desc')
      .take(options.limit)
  }

  if (options.sort === 'trending')
  {
    if (options.category)
    {
      return await ctx.db
        .query('templateCards')
        .withIndex('byCategoryIsPubliclyListableTrendingScore', (q) =>
          q.eq('category', options.category!).eq('isPubliclyListable', true)
        )
        .order('desc')
        .take(options.limit)
    }

    return await ctx.db
      .query('templateCards')
      .withIndex('byIsPubliclyListableTrendingScore', (q) =>
        q.eq('isPubliclyListable', true)
      )
      .order('desc')
      .take(options.limit)
  }

  if (options.category)
  {
    return await ctx.db
      .query('templateCards')
      .withIndex('byCategoryIsPubliclyListableUpdatedAt', (q) =>
        q.eq('category', options.category!).eq('isPubliclyListable', true)
      )
      .order('desc')
      .take(options.limit)
  }

  return await ctx.db
    .query('templateCards')
    .withIndex('byIsPubliclyListableUpdatedAt', (q) =>
      q.eq('isPubliclyListable', true)
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
): Promise<Doc<'templateCards'>[]> =>
{
  const tag = options.tag

  let tagIdSet: Set<string> | null = null
  if (tag)
  {
    const tagRows = options.category
      ? await ctx.db
          .query('templateTags')
          .withIndex('byCategoryTagIsPubliclyListableUpdatedAt', (q) =>
            q
              .eq('category', options.category!)
              .eq('tag', tag)
              .eq('isPubliclyListable', true)
          )
          .take(TAG_INTERSECT_ID_CAP)
      : await ctx.db
          .query('templateTags')
          .withIndex('byTagIsPubliclyListableUpdatedAt', (q) =>
            q.eq('tag', tag).eq('isPubliclyListable', true)
          )
          .take(TAG_INTERSECT_ID_CAP)
    if (tagRows.length === 0) return []
    tagIdSet = new Set(tagRows.map((row) => row.templateId as string))
  }

  const searchLimit = tag ? SEARCH_AND_TAG_OVERFETCH : options.limit
  const rows = await ctx.db
    .query('templateCards')
    .withSearchIndex('searchPublic', (q) =>
    {
      const base = q
        .search('searchText', options.search)
        .eq('isPubliclyListable', true)

      return options.category ? base.eq('category', options.category) : base
    })
    .take(searchLimit)

  const filteredRows = tagIdSet
    ? rows.filter((row) => tagIdSet!.has(row.templateId as string))
    : rows
  return filteredRows.slice(0, options.limit)
}

// resolve tag-filtered template rows via the normalized templateTags table,
// ordered by tag-row updatedAt desc. denormalized listability keeps templates
// dropped from public view out of the join
const takePublicRowsByTag = async (
  ctx: QueryCtx,
  options: {
    tag: string
    category: TemplateCategory | null
    limit: number
  }
): Promise<Doc<'templateCards'>[]> =>
{
  const tagRows = options.category
    ? await ctx.db
        .query('templateTags')
        .withIndex('byCategoryTagIsPubliclyListableUpdatedAt', (q) =>
          q
            .eq('category', options.category!)
            .eq('tag', options.tag)
            .eq('isPubliclyListable', true)
        )
        .order('desc')
        .take(options.limit)
    : await ctx.db
        .query('templateTags')
        .withIndex('byTagIsPubliclyListableUpdatedAt', (q) =>
          q.eq('tag', options.tag).eq('isPubliclyListable', true)
        )
        .order('desc')
        .take(options.limit)

  const cards = await Promise.all(
    tagRows.map((row) => findTemplateCardByTemplateId(ctx, row.templateId))
  )
  return cards.filter(
    (card): card is Doc<'templateCards'> =>
      card !== null && card.isPubliclyListable
  )
}

const readViewerPlan = async (ctx: QueryCtx): Promise<UserPlan> =>
{
  const user = await getCurrentUser(ctx)
  return user?.plan ?? 'free'
}

const toTemplateGalleryCard = async (
  ctx: QueryCtx,
  row: Doc<'templateCards'>,
  viewerPlan: UserPlan,
  cache: ReturnType<typeof createTemplateProjectionCache>
): Promise<MarketplaceTemplateGalleryCard> =>
{
  const summary = await toTemplateCardSummary(ctx, row, cache)
  return {
    ...summary,
    access: getTemplateAccessState(row, viewerPlan),
  }
}

const toTemplateGalleryCards = async (
  ctx: QueryCtx,
  rows: Doc<'templateCards'>[],
  viewerPlan: UserPlan,
  cache: ReturnType<typeof createTemplateProjectionCache>
): Promise<MarketplaceTemplateGalleryCard[]> =>
  await Promise.all(
    rows.map((row) => toTemplateGalleryCard(ctx, row, viewerPlan, cache))
  )

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
        rows.map((row) => toTemplateCardSummary(ctx, row, cache))
      ),
    }
  },
})

export const getTemplatesGallery = query({
  args: {
    search: v.optional(v.union(v.string(), v.null())),
    category: listCategoryArg,
    tag: v.optional(v.union(v.string(), v.null())),
    sort: listSortArg,
    limit: v.optional(v.number()),
  },
  returns: marketplaceTemplateGalleryResultValidator,
  handler: async (ctx, args): Promise<MarketplaceTemplateGalleryResult> =>
  {
    const limit = normalizeListLimit(args.limit)
    const category = args.category ?? null
    const search = normalizeSearchQuery(args.search)
    const tag = normalizeTagArg(args.tag)
    const sort = args.sort ?? 'recent'

    const resultsPromise = search
      ? searchPublicRows(ctx, { search, category, tag, limit })
      : tag
        ? takePublicRowsByTag(ctx, { tag, category, limit })
        : takePublicRows(ctx, { category, sort, limit })

    const [
      featuredRows,
      trendingRows,
      popularRows,
      recentRows,
      resultsRows,
      stats,
      viewerPlan,
    ] = await Promise.all([
      takePublicRows(ctx, {
        category: null,
        sort: 'featured',
        limit: FEATURED_LIMIT,
      }),
      takePublicRows(ctx, {
        category: null,
        sort: 'trending',
        limit: RAIL_LIMIT,
      }),
      takePublicRows(ctx, {
        category: null,
        sort: 'popular',
        limit: RAIL_LIMIT,
      }),
      takePublicRows(ctx, {
        category: null,
        sort: 'recent',
        limit: RAIL_LIMIT,
      }),
      resultsPromise,
      readPublicTemplateStats(ctx),
      readViewerPlan(ctx),
    ])

    const cache = createTemplateProjectionCache()
    const [featured, trending, popular, recent, results] = await Promise.all([
      toTemplateGalleryCards(ctx, featuredRows, viewerPlan, cache),
      toTemplateGalleryCards(ctx, trendingRows, viewerPlan, cache),
      toTemplateGalleryCards(ctx, popularRows, viewerPlan, cache),
      toTemplateGalleryCards(ctx, recentRows, viewerPlan, cache),
      toTemplateGalleryCards(ctx, resultsRows, viewerPlan, cache),
    ])

    return {
      featured,
      trending,
      popular,
      recent,
      results,
      templateCount: {
        count: stats.count,
        countByCategory: stats.countByCategory,
      },
    }
  },
})

export const getTemplateGalleryRail = query({
  args: {
    rail: templateGalleryRailValidator,
    limit: v.optional(v.number()),
  },
  returns: marketplaceTemplateGalleryRailResultValidator,
  handler: async (ctx, args): Promise<MarketplaceTemplateGalleryRailResult> =>
  {
    const [rows, viewerPlan] = await Promise.all([
      takePublicRows(ctx, {
        category: null,
        sort: TEMPLATE_GALLERY_RAIL_SORT[args.rail],
        limit:
          args.limit === undefined
            ? defaultGalleryRailLimit(args.rail)
            : normalizeListLimit(args.limit),
      }),
      readViewerPlan(ctx),
    ])

    return {
      items: await toTemplateGalleryCards(
        ctx,
        rows,
        viewerPlan,
        createTemplateProjectionCache()
      ),
    }
  },
})

export const getTemplateGalleryResults = query({
  args: {
    search: v.optional(v.union(v.string(), v.null())),
    category: listCategoryArg,
    tag: v.optional(v.union(v.string(), v.null())),
    sort: listSortArg,
    limit: v.optional(v.number()),
  },
  returns: marketplaceTemplateGalleryResultsResultValidator,
  handler: async (
    ctx,
    args
  ): Promise<MarketplaceTemplateGalleryResultsResult> =>
  {
    const limit = normalizeListLimit(args.limit)
    const category = args.category ?? null
    const search = normalizeSearchQuery(args.search)
    const tag = normalizeTagArg(args.tag)
    const sort = args.sort ?? 'recent'

    const resultsPromise = search
      ? searchPublicRows(ctx, { search, category, tag, limit })
      : tag
        ? takePublicRowsByTag(ctx, { tag, category, limit })
        : takePublicRows(ctx, { category, sort, limit })

    const [resultsRows, stats, viewerPlan] = await Promise.all([
      resultsPromise,
      readPublicTemplateStats(ctx),
      readViewerPlan(ctx),
    ])

    return {
      results: await toTemplateGalleryCards(
        ctx,
        resultsRows,
        viewerPlan,
        createTemplateProjectionCache()
      ),
      templateCount: {
        count: stats.count,
        countByCategory: stats.countByCategory,
      },
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
    if (!template || !isPublishedTemplateRow(template))
    {
      return null
    }

    const cache = createTemplateProjectionCache()
    const viewerPlan = await readViewerPlan(ctx)
    return await toTemplateDetail(ctx, template, viewerPlan, cache)
  },
})

export const listTemplateItems = query({
  args: {
    slug: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: marketplaceTemplateItemsResultValidator,
  handler: async (ctx, args): Promise<MarketplaceTemplateItemsResult> =>
  {
    if (!isTemplateSlug(args.slug))
    {
      return emptyTemplateItemsResult(args.paginationOpts.cursor)
    }

    const template = await findTemplateBySlug(ctx, args.slug)
    if (!template || !isPublishedTemplateRow(template))
    {
      return emptyTemplateItemsResult(args.paginationOpts.cursor)
    }

    const result = await ctx.db
      .query('templateItems')
      .withIndex('byTemplate', (q) => q.eq('templateId', template._id))
      .order('asc')
      .paginate({
        cursor: args.paginationOpts.cursor,
        numItems: normalizeTemplateItemPageSize(args.paginationOpts.numItems),
      })
    const cache = createTemplateProjectionCache()
    return {
      ...result,
      page: await Promise.all(
        result.page.map((item) => toTemplateItem(ctx, item, cache))
      ),
    }
  },
})

export const getMyTemplatePublishJob = query({
  args: { jobId: v.id('templatePublishJobs') },
  returns: v.union(marketplaceTemplatePublishJobProgressValidator, v.null()),
  handler: async (
    ctx,
    args
  ): Promise<MarketplaceTemplatePublishJobProgress | null> =>
  {
    const userId = await getCurrentUserId(ctx)
    if (!userId) return null

    const job = await ctx.db.get(args.jobId)
    if (!job || job.ownerId !== userId) return null
    return await toPublishJobProgress(ctx, job)
  },
})

export const getMyTemplateCloneJob = query({
  args: { jobId: v.id('templateCloneJobs') },
  returns: v.union(marketplaceTemplateCloneJobProgressValidator, v.null()),
  handler: async (
    ctx,
    args
  ): Promise<MarketplaceTemplateCloneJobProgress | null> =>
  {
    const userId = await getCurrentUserId(ctx)
    if (!userId) return null

    const job = await ctx.db.get(args.jobId)
    if (!job || job.ownerId !== userId) return null
    return await toCloneJobProgress(ctx, job)
  },
})

// related-templates rail on the detail page — same category, top use count,
// excluding the current slug. category is derived from the looked-up template
// row to avoid stale client args
const DEFAULT_RELATED_LIMIT = 4
const MAX_RELATED_LIMIT = 12

const normalizeRelatedLimit = (raw: number | undefined): number =>
{
  if (raw === undefined)
  {
    return DEFAULT_RELATED_LIMIT
  }
  if (!Number.isFinite(raw) || raw < 1)
  {
    failInput('related template limit must be a finite number of at least 1')
  }
  return Math.min(Math.floor(raw), MAX_RELATED_LIMIT)
}

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
    const card = await ctx.db
      .query('templateCards')
      .withIndex('bySlug', (q) => q.eq('slug', args.slug))
      .unique()
    if (!card || !card.isPubliclyListable)
    {
      return { items: [] }
    }

    const limit = normalizeRelatedLimit(args.limit)
    const rows = await ctx.db
      .query('templateCards')
      .withIndex('byCategoryIsPubliclyListableForkCount', (q) =>
        q.eq('category', card.category).eq('isPubliclyListable', true)
      )
      .order('desc')
      .take(limit + 1)

    const filtered = rows
      .filter((row) => row.slug !== args.slug)
      .slice(0, limit)

    const cache = createTemplateProjectionCache()
    return {
      items: await Promise.all(
        filtered.map((row) => toTemplateCardSummary(ctx, row, cache))
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
      .query('templateCards')
      .withIndex('byAuthorUpdatedAt', (q) => q.eq('authorId', userId))
      .order('desc')
      .take(normalizeListLimit(args.limit))

    const cache = createTemplateProjectionCache()
    return {
      items: await Promise.all(
        rows.map((row) => toTemplateCardSummary(ctx, row, cache))
      ),
    }
  },
})

export const getMyTemplateManagementList = query({
  args: { limit: v.optional(v.number()) },
  returns: marketplaceTemplateManagementListResultValidator,
  handler: async (
    ctx,
    args
  ): Promise<MarketplaceTemplateManagementListResult> =>
  {
    const userId = await getCurrentUserId(ctx)
    if (!userId)
    {
      return { items: [] }
    }

    const rows = await ctx.db
      .query('templateCards')
      .withIndex('byAuthorUpdatedAt', (q) => q.eq('authorId', userId))
      .order('desc')
      .take(normalizeListLimit(args.limit))

    const cache = createTemplateProjectionCache()
    return {
      items: await Promise.all(
        rows.map(async (row) => ({
          ...(await toTemplateCardSummary(ctx, row, cache)),
          isPubliclyListable: row.isPubliclyListable,
        }))
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
          .map((board) => getBoardSourceTemplateId(board))
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
        const sourceTemplateId = getBoardSourceTemplateId(board)
        if (sourceTemplateId === null)
        {
          return null
        }
        const template = templatesById.get(sourceTemplateId)
        return template
          ? await toTemplateDraft(ctx, board, template, cache)
          : null
      })
    )

    return { drafts: drafts.filter((draft) => draft !== null) }
  },
})
