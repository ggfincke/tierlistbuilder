// convex/marketplace/rankings/queries.ts
// public ranking detail/list reads plus signed-in owner listing

import { v } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import { query, type QueryCtx } from '../../_generated/server'
import type { Id } from '../../_generated/dataModel'
import type {
  MarketplaceRankingDetail,
  MarketplaceRankingListResult,
  MarketplaceRankingPublishAvailability,
  RankingPublishBlockReason,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import type {
  MarketplaceTemplateRankingAggregate,
  MarketplaceTemplateRankingAggregateItem,
  MarketplaceTemplateRankingAggregateItemsResult,
  TemplateRankingAggregateItemSort,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import { isRankingSlug } from '@tierlistbuilder/contracts/marketplace/ranking'
import {
  marketplaceRankingDetailValidator,
  marketplaceRankingListResultValidator,
  marketplaceRankingPublishAvailabilityValidator,
  marketplaceTemplateRankingAggregateItemsResultValidator,
  marketplaceTemplateRankingAggregateValidator,
  templateRankingAggregateItemSortValidator,
} from '../../lib/validators'
import { getCurrentUserId } from '../../lib/auth'
import { findOwnedBoardByExternalIdIncludingDeleted } from '../../lib/permissions'
import { isTemplateSlug } from '@tierlistbuilder/contracts/marketplace/template'
import {
  createTemplateProjectionCache,
  findTemplateBySlug,
  isPublishedTemplateRow,
} from '../templates/lib'
import {
  DEFAULT_TEMPLATE_RANKING_AGGREGATE_SORT,
  findTemplateRankingAggregate,
  normalizeTemplateRankingAggregateItemPageSize,
  toTemplateRankingAggregate,
  toTemplateRankingAggregateItem,
} from './aggregate'
import {
  findRankingBySlug,
  isPublicRankingRow,
  isPublishedRankingRow,
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
  }
): MarketplaceRankingPublishAvailability => ({
  canPublish: false,
  reason,
  message: RANKING_PUBLISH_BLOCK_MESSAGES[reason],
  ...counts,
})

const emptyAggregateItemsResult = (
  cursor: string | null
): MarketplaceTemplateRankingAggregateItemsResult => ({
  page: [],
  isDone: true,
  continueCursor: cursor ?? '',
})

const aggregateSortArg = v.optional(templateRankingAggregateItemSortValidator)

const isAggregateItem = (
  item: MarketplaceTemplateRankingAggregateItem | null
): item is MarketplaceTemplateRankingAggregateItem => item !== null

const takeAggregateItemsPage = async (
  ctx: QueryCtx,
  options: {
    templateId: Id<'templates'>
    generation: number
    sort: TemplateRankingAggregateItemSort
    cursor: string | null
    numItems: number
  }
) =>
{
  const pageSize = normalizeTemplateRankingAggregateItemPageSize(
    options.numItems
  )
  if (options.sort === 'averageTop')
  {
    return await ctx.db
      .query('templateRankingAggregateItems')
      .withIndex('byTemplateIdAndGenerationAndAverageTopSortAndOrder', (q) =>
        q
          .eq('templateId', options.templateId)
          .eq('generation', options.generation)
      )
      .paginate({ cursor: options.cursor, numItems: pageSize })
  }
  if (options.sort === 'averageBottom')
  {
    return await ctx.db
      .query('templateRankingAggregateItems')
      .withIndex('byTemplateIdAndGenerationAndAverageBottomSortAndOrder', (q) =>
        q
          .eq('templateId', options.templateId)
          .eq('generation', options.generation)
      )
      .paginate({ cursor: options.cursor, numItems: pageSize })
  }
  if (options.sort === 'consensus')
  {
    return await ctx.db
      .query('templateRankingAggregateItems')
      .withIndex('byTemplateIdAndGenerationAndConsensusSortAndOrder', (q) =>
        q
          .eq('templateId', options.templateId)
          .eq('generation', options.generation)
      )
      .paginate({ cursor: options.cursor, numItems: pageSize })
  }
  if (options.sort === 'controversy')
  {
    return await ctx.db
      .query('templateRankingAggregateItems')
      .withIndex('byTemplateIdAndGenerationAndControversySortAndOrder', (q) =>
        q
          .eq('templateId', options.templateId)
          .eq('generation', options.generation)
      )
      .paginate({ cursor: options.cursor, numItems: pageSize })
  }

  return await ctx.db
    .query('templateRankingAggregateItems')
    .withIndex('byTemplateIdAndGenerationAndOrder', (q) =>
      q
        .eq('templateId', options.templateId)
        .eq('generation', options.generation)
    )
    .paginate({ cursor: options.cursor, numItems: pageSize })
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

export const getTemplateRankingAggregate = query({
  args: { templateSlug: v.string() },
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

    const aggregate = await findTemplateRankingAggregate(ctx, template._id)
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
    generation: v.number(),
    paginationOpts: paginationOptsValidator,
    sort: aggregateSortArg,
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

    const aggregate = await findTemplateRankingAggregate(ctx, template._id)
    if (!aggregate || aggregate.activeGeneration !== args.generation)
    {
      return emptyAggregateItemsResult(args.paginationOpts.cursor)
    }

    const result = await takeAggregateItemsPage(ctx, {
      templateId: template._id,
      generation: args.generation,
      sort: args.sort ?? DEFAULT_TEMPLATE_RANKING_AGGREGATE_SORT,
      cursor: args.paginationOpts.cursor,
      numItems: args.paginationOpts.numItems,
    })
    const cache = createTemplateProjectionCache()
    const page = await Promise.all(
      result.page.map((row) => toTemplateRankingAggregateItem(ctx, row, cache))
    )
    return {
      ...result,
      page: page.filter(isAggregateItem),
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

export const getBoardRankingPublishAvailability = query({
  args: { boardExternalId: v.string() },
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
    if (board.activeItemCount === 0 || board.unrankedItemCount > 0)
    {
      return unavailableRankingPublish('incomplete', templateCounts)
    }

    return {
      canPublish: true,
      reason: null,
      message: null,
      ...templateCounts,
    }
  },
})
