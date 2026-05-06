// convex/marketplace/rankings/queries.ts
// public ranking detail/list reads plus signed-in owner listing

import { v } from 'convex/values'
import { query } from '../../_generated/server'
import type {
  MarketplaceRankingDetail,
  MarketplaceRankingListResult,
  MarketplaceRankingPublishAvailability,
  RankingPublishBlockReason,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import { isRankingSlug } from '@tierlistbuilder/contracts/marketplace/ranking'
import {
  marketplaceRankingDetailValidator,
  marketplaceRankingListResultValidator,
  marketplaceRankingPublishAvailabilityValidator,
} from '../../lib/validators'
import { getCurrentUserId } from '../../lib/auth'
import { findOwnedBoardByExternalIdIncludingDeleted } from '../../lib/permissions'
import { isTemplateSlug } from '@tierlistbuilder/contracts/marketplace/template'
import { findTemplateBySlug, isPublishedTemplateRow } from '../templates/lib'
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
