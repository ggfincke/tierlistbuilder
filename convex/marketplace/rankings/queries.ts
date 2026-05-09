// convex/marketplace/rankings/queries.ts
// public ranking detail/list reads plus signed-in owner listing

import { v } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import { query, type QueryCtx } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import type {
  MarketplaceMyRankingForTemplateResult,
  MarketplaceRankingDetail,
  MarketplaceRankingListResult,
  MarketplaceRankingPaginatedResult,
  MarketplaceRankingPublishAvailability,
  RankingListSort,
  RankingPublishBlockReason,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import type {
  MarketplaceTemplateRankingAggregate,
  MarketplaceTemplateRankingAggregateItemsResult,
  TemplateRankingAggregateItemBand,
  TemplateRankingAggregateItemSort,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import type { MarketplaceTemplateCriterion } from '@tierlistbuilder/contracts/marketplace/templateCriterion'
import {
  buildRankingBucketPlacements,
  isRankingSlug,
} from '@tierlistbuilder/contracts/marketplace/ranking'
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
} from '../../lib/validators'
import { getCurrentUserId } from '../../lib/auth'
import { MAX_AGGREGATE_SEARCH_LENGTH, MAX_SYNC_ITEMS } from '../../lib/limits'
import { findOwnedBoardByExternalIdIncludingDeleted } from '../../lib/permissions'
import { isTemplateSlug } from '@tierlistbuilder/contracts/marketplace/template'
import {
  createTemplateProjectionCache,
  findTemplateBySlug,
  isPublishedTemplateRow,
} from '../templates/lib'
import {
  resolvePrimaryTemplateCriterion,
  resolveTemplateCriteria,
  resolveTemplateCriterionForHistoricalRead,
} from '../templates/criteria'
import {
  DEFAULT_TEMPLATE_RANKING_AGGREGATE_SORT,
  findTemplateRankingAggregate,
  normalizeTemplateRankingAggregateItemPageSize,
  resolveTemplateRankingAggregateBucketLabels,
  resolveTemplateRankingAggregateBucketCount,
  toTemplateRankingAggregate,
  toTemplateRankingAggregateItem,
} from './aggregate'
import {
  findRankingBySlug,
  isPublicRankingRow,
  isPublishedRankingRow,
  loadRankingItems,
  loadRankingTiers,
  normalizeRankingLimit,
  toRankingDetail,
  toRankingSummary,
} from './lib'

const RANKING_PUBLISH_BLOCK_MESSAGES: Record<
  RankingPublishBlockReason,
  string
> = {
  sign_in_required: 'Sign in to publish a ranking.',
  not_found: 'Board not found.',
  board_deleted: 'Restore this board before publishing a ranking.',
  syncing: 'Wait for this board to finish syncing before publishing a ranking.',
  not_template_backed:
    'Publish this board as a template instead. Rankings are for boards made from marketplace templates.',
  incomplete:
    'Rank every item from the source template before publishing a ranking.',
  source_template_unpublished: 'The source template is no longer published.',
  criterion_not_found: 'Ranking criterion not found.',
  criterion_not_publishable:
    'This ranking criterion is not available for new rankings.',
}

const unavailableRankingPublish = (
  reason: RankingPublishBlockReason,
  counts: Pick<
    MarketplaceRankingPublishAvailability,
    'activeItemCount' | 'unrankedItemCount' | 'sourceTemplateTitle'
  > = {
    activeItemCount: 0,
    unrankedItemCount: 0,
    sourceTemplateTitle: null,
  },
  userPublishedCriterionExternalIds: string[] = [],
  sourceTemplateCriteria: MarketplaceTemplateCriterion[] = []
): MarketplaceRankingPublishAvailability => ({
  canPublish: false,
  reason,
  message: RANKING_PUBLISH_BLOCK_MESSAGES[reason],
  ...counts,
  sourceTemplateCriteria,
  userPublishedCriterionExternalIds,
})

const emptyAggregateItemsResult = (
  cursor: string | null
): MarketplaceTemplateRankingAggregateItemsResult => ({
  page: [],
  isDone: true,
  continueCursor: cursor ?? '',
})

const emptyRankingPaginatedResult = (
  cursor: string | null
): MarketplaceRankingPaginatedResult => ({
  page: [],
  isDone: true,
  continueCursor: cursor ?? '',
})

const emptyMyRankingForTemplateResult =
  (): MarketplaceMyRankingForTemplateResult => ({
    ranking: null,
    placements: {},
  })

const aggregateSortArg = v.optional(templateRankingAggregateItemSortValidator)
const aggregateBandArg = v.optional(templateRankingAggregateItemBandValidator)
const rankingSortArg = v.optional(rankingListSortValidator)
const SEARCH_CURSOR_PREFIX = 'offset:'

type CriterionRequestResolution =
  | { kind: 'unspecified' }
  | { kind: 'found'; criterion: MarketplaceTemplateCriterion }
  | { kind: 'missing' }

const resolveCriterionRequest = (
  template: Doc<'templates'>,
  criterionExternalId: string | undefined
): CriterionRequestResolution =>
{
  if (criterionExternalId === undefined) return { kind: 'unspecified' }
  const criterion = resolveTemplateCriterionForHistoricalRead(
    template,
    criterionExternalId
  )
  return criterion ? { kind: 'found', criterion } : { kind: 'missing' }
}

const resolveDefaultedCriterion = (
  template: Doc<'templates'>,
  resolution: CriterionRequestResolution
): MarketplaceTemplateCriterion | null =>
{
  if (resolution.kind === 'missing') return null
  if (resolution.kind === 'unspecified')
  {
    return resolvePrimaryTemplateCriterion(template)
  }
  return resolution.criterion
}

const resolveHistoricalCriterionExternalId = (
  template: Doc<'templates'>,
  criterionExternalId: string | undefined
): string | null | undefined =>
{
  const resolution = resolveCriterionRequest(template, criterionExternalId)
  if (resolution.kind === 'unspecified') return undefined
  if (resolution.kind === 'missing') return null
  return resolution.criterion.externalId
}

const resolveMyRankingCriterionExternalId = (
  template: Doc<'templates'>,
  criterionExternalId: string | undefined
): string | null =>
{
  const criterion = resolveDefaultedCriterion(
    template,
    resolveCriterionRequest(template, criterionExternalId)
  )
  return criterion?.externalId ?? null
}

const criterionPublishBlockReason = (
  template: Doc<'templates'>,
  criterionExternalId: string | undefined
): RankingPublishBlockReason | null =>
{
  const criterion = resolveDefaultedCriterion(
    template,
    resolveCriterionRequest(template, criterionExternalId)
  )
  if (!criterion) return 'criterion_not_found'
  if (criterion.status !== 'active') return 'criterion_not_publishable'
  return null
}

const resolveAggregateCriterionExternalId = (
  template: Doc<'templates'>,
  criterionExternalId: string | undefined
): string | null =>
{
  const criterion = resolveDefaultedCriterion(
    template,
    resolveCriterionRequest(template, criterionExternalId)
  )
  if (!criterion || criterion.status !== 'active') return null
  return criterion.externalId
}

const normalizeAggregateSearch = (
  raw: string | null | undefined
): string | null =>
{
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().slice(0, MAX_AGGREGATE_SEARCH_LENGTH)
  return trimmed.length > 0 ? trimmed : null
}

const parseSearchCursorOffset = (cursor: string | null): number =>
{
  if (!cursor?.startsWith(SEARCH_CURSOR_PREFIX)) return 0
  const parsed = Number(cursor.slice(SEARCH_CURSOR_PREFIX.length))
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}

const searchCursorForOffset = (offset: number): string =>
  `${SEARCH_CURSOR_PREFIX}${offset}`

type AggregateItemRow = Doc<'templateRankingAggregateItems'>

const aggregateSortValue = (
  row: AggregateItemRow,
  sort: TemplateRankingAggregateItemSort
): number =>
{
  if (sort === 'averageTop') return row.averageTopSort
  if (sort === 'averageBottom') return row.averageBottomSort
  if (sort === 'consensus' || sort === 'consensusTop') return row.consensusSort
  if (sort === 'controversy') return row.controversySort
  return row.order
}

const sortAggregateRows = (
  rows: AggregateItemRow[],
  sort: TemplateRankingAggregateItemSort
): AggregateItemRow[] =>
  rows
    .slice()
    .sort(
      (a, b) =>
        aggregateSortValue(a, sort) - aggregateSortValue(b, sort) ||
        a.order - b.order
    )

interface AggregateItemsPageOptions
{
  templateId: Id<'templates'>
  criterionExternalId: string
  generation: number
  sort: TemplateRankingAggregateItemSort
  band: TemplateRankingAggregateItemBand
  search: string | null
  cursor: string | null
  numItems: number
}

const takeSearchAggregateItemsPage = async (
  ctx: QueryCtx,
  options: AggregateItemsPageOptions,
  pageSize: number
) =>
{
  const search = options.search
  if (!search) return null

  const rows = await ctx.db
    .query('templateRankingAggregateItems')
    .withSearchIndex('searchByTemplateCriterionGeneration', (q) =>
    {
      const base = q
        .search('searchText', search)
        .eq('templateId', options.templateId)
        .eq('criterionExternalId', options.criterionExternalId)
        .eq('generation', options.generation)
      if (options.band === 'top')
      {
        return base.eq('isTopBucket', true)
      }
      if (options.band === 'bottom')
      {
        return base.eq('isBottomBucket', true)
      }
      if (options.band === 'controversial')
      {
        return base.eq('isControversial', true)
      }
      if (options.sort === 'consensusTop')
      {
        return base.eq('isTopBucket', true)
      }
      return base
    })
    .take(MAX_SYNC_ITEMS)
  const sorted = sortAggregateRows(rows, options.sort)
  const offset = parseSearchCursorOffset(options.cursor)
  const nextOffset = offset + pageSize
  const page = sorted.slice(offset, nextOffset)
  const isDone = nextOffset >= sorted.length
  return {
    page,
    isDone,
    continueCursor: isDone ? '' : searchCursorForOffset(nextOffset),
  }
}

const aggregateItemsIndexByBand = {
  all: {
    averageTop: 'byTemplateIdAndCriterionAndGenerationAndAvgTopSortAndOrder',
    averageBottom:
      'byTemplateIdAndCriterionAndGenerationAndAvgBottomSortAndOrder',
    consensus: 'byTemplateIdAndCriterionAndGenerationAndConsensusSortAndOrder',
    consensusTop: 'byTemplateCriterionGenerationTopConsensusOrder',
    controversy:
      'byTemplateIdAndCriterionAndGenerationAndControversySortAndOrder',
    templateOrder: 'byTemplateIdAndCriterionAndGenerationAndOrder',
  },
  top: {
    averageTop: 'byTemplateCriterionGenerationTopAverageTopOrder',
    averageBottom: 'byTemplateCriterionGenerationTopAverageBottomOrder',
    consensus: 'byTemplateCriterionGenerationTopConsensusOrder',
    consensusTop: 'byTemplateCriterionGenerationTopConsensusOrder',
    controversy: 'byTemplateCriterionGenerationTopControversyOrder',
    templateOrder: 'byTemplateCriterionGenerationTopOrder',
  },
  bottom: {
    averageTop: 'byTemplateCriterionGenerationBottomAverageTopOrder',
    averageBottom: 'byTemplateCriterionGenerationBottomAverageBottomOrder',
    consensus: 'byTemplateCriterionGenerationBottomConsensusOrder',
    consensusTop: 'byTemplateCriterionGenerationBottomConsensusOrder',
    controversy: 'byTemplateCriterionGenerationBottomControversyOrder',
    templateOrder: 'byTemplateCriterionGenerationBottomOrder',
  },
  controversial: {
    averageTop: 'byTemplateCriterionGenerationControversialAverageTopOrder',
    averageBottom:
      'byTemplateCriterionGenerationControversialAverageBottomOrder',
    consensus: 'byTemplateCriterionGenerationControversialConsensusOrder',
    consensusTop: 'byTemplateCriterionGenerationControversialConsensusOrder',
    controversy: 'byTemplateCriterionGenerationControversialControversyOrder',
    templateOrder: 'byTemplateCriterionGenerationControversialOrder',
  },
} as const satisfies Record<
  TemplateRankingAggregateItemBand,
  Record<TemplateRankingAggregateItemSort, string>
>

const resolveAggregateItemsIndexBand = (
  band: TemplateRankingAggregateItemBand,
  sort: TemplateRankingAggregateItemSort
): TemplateRankingAggregateItemBand =>
  band === 'all' && sort === 'consensusTop' ? 'top' : band

const takeIndexedAggregateItemsPage = async (
  ctx: QueryCtx,
  options: AggregateItemsPageOptions,
  pageSize: number
) =>
{
  const indexBand = resolveAggregateItemsIndexBand(options.band, options.sort)
  const indexName = aggregateItemsIndexByBand[indexBand][options.sort]
  return await ctx.db
    .query('templateRankingAggregateItems')
    .withIndex(indexName, (q) =>
    {
      const base = q
        .eq('templateId', options.templateId)
        .eq('criterionExternalId', options.criterionExternalId)
        .eq('generation', options.generation)
      if (indexBand === 'top') return base.eq('isTopBucket', true)
      if (indexBand === 'bottom') return base.eq('isBottomBucket', true)
      if (indexBand === 'controversial')
      {
        return base.eq('isControversial', true)
      }
      return base
    })
    .paginate({ cursor: options.cursor, numItems: pageSize })
}

const takeAggregateItemsPage = async (
  ctx: QueryCtx,
  options: AggregateItemsPageOptions
) =>
{
  const pageSize = normalizeTemplateRankingAggregateItemPageSize(
    options.numItems
  )
  const searchPage = await takeSearchAggregateItemsPage(ctx, options, pageSize)
  if (searchPage) return searchPage
  return await takeIndexedAggregateItemsPage(ctx, options, pageSize)
}

const rankingPageIndexBySort = {
  featured: {
    template: 'bySourceTemplatePublicFeaturedRank',
    criterion: 'bySourceTemplateCriterionPublicFeaturedRank',
    order: 'asc',
  },
  top: {
    template: 'bySourceTemplatePublicTopScoreAndUpdatedAt',
    criterion: 'bySourceTemplateCriterionPublicTopScoreAndUpdatedAt',
    order: 'desc',
  },
  recent: {
    template: 'bySourceTemplatePublicUpdatedAt',
    criterion: 'bySourceTemplateCriterionPublicUpdatedAt',
    order: 'desc',
  },
} as const satisfies Record<
  RankingListSort,
  {
    template: string
    criterion: string
    order: 'asc' | 'desc'
  }
>

const takeRankingsForTemplatePage = async (
  ctx: QueryCtx,
  options: {
    templateId: Id<'templates'>
    criterionExternalId?: string
    sort: RankingListSort
    cursor: string | null
    numItems: number
  }
) =>
{
  const pageSize = normalizeRankingLimit(options.numItems)
  const criterionExternalId = options.criterionExternalId
  const indexConfig = rankingPageIndexBySort[options.sort]
  if (criterionExternalId !== undefined)
  {
    return await ctx.db
      .query('publishedRankings')
      .withIndex(indexConfig.criterion, (q) =>
      {
        const base = q
          .eq('sourceTemplateId', options.templateId)
          .eq('sourceCriterionExternalId', criterionExternalId)
          .eq('isPubliclyListable', true)
        return options.sort === 'featured' ? base.eq('isFeatured', true) : base
      })
      .order(indexConfig.order)
      .paginate({ cursor: options.cursor, numItems: pageSize })
  }

  return await ctx.db
    .query('publishedRankings')
    .withIndex(indexConfig.template, (q) =>
    {
      const base = q
        .eq('sourceTemplateId', options.templateId)
        .eq('isPubliclyListable', true)
      return options.sort === 'featured' ? base.eq('isFeatured', true) : base
    })
    .order(indexConfig.order)
    .paginate({ cursor: options.cursor, numItems: pageSize })
}

const latestOwnedRankingForTemplate = async (
  ctx: QueryCtx,
  templateId: Id<'templates'>,
  criterionExternalId: string,
  userId: Id<'users'>
) =>
{
  const rows = await ctx.db
    .query('publishedRankings')
    .withIndex('bySourceTemplateCriterionOwnerPublicationStateUpdatedAt', (q) =>
      q
        .eq('sourceTemplateId', templateId)
        .eq('sourceCriterionExternalId', criterionExternalId)
        .eq('ownerId', userId)
        .eq('publicationState', 'published')
    )
    .order('desc')
    .take(1)
  return rows[0] ?? null
}

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
  args: {
    templateSlug: v.string(),
    limit: v.optional(v.number()),
    sort: rankingSortArg,
    criterionExternalId: v.optional(v.string()),
  },
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
    const criterionExternalId = resolveHistoricalCriterionExternalId(
      template,
      args.criterionExternalId
    )
    if (criterionExternalId === null)
    {
      return { items: [] }
    }

    const page = await takeRankingsForTemplatePage(ctx, {
      templateId: template._id,
      ...(criterionExternalId !== undefined ? { criterionExternalId } : {}),
      sort: args.sort ?? 'recent',
      cursor: null,
      numItems: normalizeRankingLimit(args.limit),
    })
    const publicRows = page.page.filter(isPublicRankingRow)
    const cache = createTemplateProjectionCache()
    return {
      items: await Promise.all(
        publicRows.map((row) => toRankingSummary(ctx, row, cache))
      ),
    }
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
    if (!isTemplateSlug(args.templateSlug))
    {
      return emptyRankingPaginatedResult(args.paginationOpts.cursor)
    }
    const template = await findTemplateBySlug(ctx, args.templateSlug)
    if (!template)
    {
      return emptyRankingPaginatedResult(args.paginationOpts.cursor)
    }
    const criterionExternalId = resolveHistoricalCriterionExternalId(
      template,
      args.criterionExternalId
    )
    if (criterionExternalId === null)
    {
      return emptyRankingPaginatedResult(args.paginationOpts.cursor)
    }

    const result = await takeRankingsForTemplatePage(ctx, {
      templateId: template._id,
      ...(criterionExternalId !== undefined ? { criterionExternalId } : {}),
      sort: args.sort ?? 'recent',
      cursor: args.paginationOpts.cursor,
      numItems: args.paginationOpts.numItems,
    })
    const page = result.page.filter(isPublicRankingRow)
    const cache = createTemplateProjectionCache()
    return {
      ...result,
      page: await Promise.all(
        page.map((row) => toRankingSummary(ctx, row, cache))
      ),
    }
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
    if (!isTemplateSlug(args.templateSlug))
    {
      return null
    }

    const template = await findTemplateBySlug(ctx, args.templateSlug)
    if (!template || !isPublishedTemplateRow(template))
    {
      return null
    }

    const criterionExternalId = resolveAggregateCriterionExternalId(
      template,
      args.criterionExternalId
    )
    if (criterionExternalId === null)
    {
      return null
    }

    const aggregate = await findTemplateRankingAggregate(
      ctx,
      template._id,
      criterionExternalId
    )
    if (!aggregate)
    {
      return null
    }
    return toTemplateRankingAggregate(template, aggregate)
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
    if (!isTemplateSlug(args.templateSlug))
    {
      return emptyAggregateItemsResult(args.paginationOpts.cursor)
    }

    const template = await findTemplateBySlug(ctx, args.templateSlug)
    if (!template || !isPublishedTemplateRow(template))
    {
      return emptyAggregateItemsResult(args.paginationOpts.cursor)
    }

    const criterionExternalId = resolveAggregateCriterionExternalId(
      template,
      args.criterionExternalId
    )
    if (criterionExternalId === null)
    {
      return emptyAggregateItemsResult(args.paginationOpts.cursor)
    }

    const aggregate = await findTemplateRankingAggregate(
      ctx,
      template._id,
      criterionExternalId
    )
    if (!aggregate || aggregate.activeGeneration !== args.generation)
    {
      return emptyAggregateItemsResult(args.paginationOpts.cursor)
    }

    const result = await takeAggregateItemsPage(ctx, {
      templateId: template._id,
      criterionExternalId,
      generation: args.generation,
      sort: args.sort ?? DEFAULT_TEMPLATE_RANKING_AGGREGATE_SORT,
      band: args.band ?? 'all',
      search: normalizeAggregateSearch(args.search),
      cursor: args.paginationOpts.cursor,
      numItems: args.paginationOpts.numItems,
    })
    const cache = createTemplateProjectionCache()
    const page = await Promise.all(
      result.page.map((row) => toTemplateRankingAggregateItem(ctx, row, cache))
    )
    return {
      ...result,
      page,
    }
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
    const userId = await getCurrentUserId(ctx)
    if (!userId || !isTemplateSlug(args.templateSlug))
    {
      return emptyMyRankingForTemplateResult()
    }

    const template = await findTemplateBySlug(ctx, args.templateSlug)
    if (!template)
    {
      return emptyMyRankingForTemplateResult()
    }

    const criterionExternalId = resolveMyRankingCriterionExternalId(
      template,
      args.criterionExternalId
    )
    if (criterionExternalId === null)
    {
      return emptyMyRankingForTemplateResult()
    }
    const ranking = await latestOwnedRankingForTemplate(
      ctx,
      template._id,
      criterionExternalId,
      userId
    )
    if (!ranking)
    {
      return emptyMyRankingForTemplateResult()
    }

    const bucketCount = resolveTemplateRankingAggregateBucketCount(template)
    const cache = createTemplateProjectionCache()
    const [tiers, items, summary] = await Promise.all([
      loadRankingTiers(ctx, ranking._id),
      loadRankingItems(ctx, ranking._id),
      toRankingSummary(ctx, ranking, cache),
    ])

    const bucketLabels = resolveTemplateRankingAggregateBucketLabels(
      template,
      bucketCount
    )
    return {
      ranking: summary,
      placements: buildRankingBucketPlacements(
        tiers,
        items,
        bucketCount,
        bucketLabels
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
    const cache = createTemplateProjectionCache()
    return {
      items: await Promise.all(
        rows.map((row) => toRankingSummary(ctx, row, cache))
      ),
    }
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
    const userId = await getCurrentUserId(ctx)
    if (!userId)
    {
      return unavailableRankingPublish('sign_in_required')
    }

    const board = await findOwnedBoardByExternalIdIncludingDeleted(
      ctx,
      args.boardExternalId,
      userId
    )
    if (!board)
    {
      return unavailableRankingPublish('not_found')
    }

    const counts = {
      activeItemCount: board.activeItemCount,
      unrankedItemCount: board.unrankedItemCount,
      sourceTemplateTitle: null,
    }
    if (board.deletedAt !== null)
    {
      return unavailableRankingPublish('board_deleted', counts)
    }
    if (board.materializationState !== 'ready')
    {
      return unavailableRankingPublish('syncing', counts)
    }
    if (board.sourceTemplateId === null)
    {
      return unavailableRankingPublish('not_template_backed', counts)
    }

    const template = await ctx.db.get(board.sourceTemplateId)
    const templateCounts = {
      ...counts,
      sourceTemplateTitle: template?.title ?? null,
    }
    if (!template || !isPublishedTemplateRow(template))
    {
      return unavailableRankingPublish(
        'source_template_unpublished',
        templateCounts
      )
    }
    const userPublishedCriterionExternalIds =
      await loadUserPublishedCriterionExternalIds(ctx, template._id, userId)
    // include only active criteria — the picker is for new rankings, so
    // hidden/deprecated lanes shouldn't appear as options. resolveTemplate-
    // Criteria already validates the array shape & enforces ordering
    const sourceTemplateCriteria = resolveTemplateCriteria(template).filter(
      (c) => c.status === 'active'
    )
    const criterionBlockReason = criterionPublishBlockReason(
      template,
      args.criterionExternalId
    )
    if (criterionBlockReason)
    {
      return unavailableRankingPublish(
        criterionBlockReason,
        templateCounts,
        userPublishedCriterionExternalIds,
        sourceTemplateCriteria
      )
    }
    if (board.activeItemCount === 0 || board.unrankedItemCount > 0)
    {
      return unavailableRankingPublish(
        'incomplete',
        templateCounts,
        userPublishedCriterionExternalIds,
        sourceTemplateCriteria
      )
    }

    return {
      canPublish: true,
      reason: null,
      message: null,
      ...templateCounts,
      sourceTemplateCriteria,
      userPublishedCriterionExternalIds,
    }
  },
})

// criterion ids the signed-in user already has a public-listable ranking
// for on this template — uniqued, in stable insertion order. used by the
// publish modal to show an "updates yours" pill on each lane chip.
const loadUserPublishedCriterionExternalIds = async (
  ctx: QueryCtx,
  templateId: Id<'templates'>,
  userId: Id<'users'>
): Promise<string[]> =>
{
  const rows = await ctx.db
    .query('publishedRankings')
    .withIndex('bySourceTemplateOwnerPublicCreatedAt', (q) =>
      q
        .eq('sourceTemplateId', templateId)
        .eq('ownerId', userId)
        .eq('isPubliclyListable', true)
    )
    .collect()
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of rows)
  {
    if (seen.has(row.sourceCriterionExternalId)) continue
    seen.add(row.sourceCriterionExternalId)
    out.push(row.sourceCriterionExternalId)
  }
  return out
}
