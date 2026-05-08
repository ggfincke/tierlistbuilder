// convex/marketplace/rankings/mutations.ts
// publish completed template rankings & remix ranking snapshots into boards

import { ConvexError, v } from 'convex/values'
import {
  internalMutation,
  mutation,
  type MutationCtx,
} from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import {
  generateBoardId,
  generateItemId,
  generateTierId,
} from '@tierlistbuilder/contracts/lib/ids'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { normalizeBoardTitle } from '@tierlistbuilder/contracts/workspace/board'
import {
  isRankingSlug,
  type MarketplaceRankingPublishResult,
  type MarketplaceRankingRemixResult,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import {
  assertCanUseTemplate,
  assertRankingFitsSingleTransaction,
} from '../../lib/entitlements'
import { requireCurrentUserId } from '../../lib/auth'
import { requireBoardOwnershipByExternalId } from '../../lib/permissions'
import { loadMediaVariantStorageId } from '../../lib/mediaVariants'
import { loadBoundedBoardRows } from '../../workspace/sync/loadBoundedBoardRows'
import { buildFreshBoardCloudFields } from '../../workspace/boards/cloudFields'
import {
  buildBoardLibrarySummary,
  EMPTY_BOARD_LIBRARY_SUMMARY,
  type BoardLibrarySummaryItem,
  type BoardLibrarySummaryTier,
} from '../../workspace/boards/librarySummary'
import { resolveTemplateProgressState } from '../../lib/templateProgress'
import {
  marketplaceRankingPublishResultValidator,
  marketplaceRankingRemixResultValidator,
  rankingFeaturedBadgeValidator,
  rankingVisibilityValidator,
} from '../../lib/validators'
import {
  allocateRankingSlug,
  findRankingBySlug,
  isPublishedRankingRow,
  loadRankingItems,
  loadRankingTiers,
  normalizeRankingDescription,
  normalizeRankingTitle,
  rankingTopScore,
} from './lib'
import {
  incrementTemplateUseStats,
  isPublishedTemplateRow,
} from '../templates/lib'
import {
  resolveActiveTemplateCriterion,
  toTemplateCriterionSnapshot,
} from '../templates/criteria'
import { queueTemplateRankingAggregateRecompute } from './aggregate'

const requireTemplate = async (
  ctx: MutationCtx,
  templateId: Id<'templates'>
): Promise<Doc<'templates'>> =>
{
  const template = await ctx.db.get(templateId)
  if (!template)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.notFound,
      message: 'source template not found',
    })
  }
  return template
}

const requireTemplateItem = async (
  ctx: MutationCtx,
  itemId: Id<'templateItems'>
): Promise<Doc<'templateItems'>> =>
{
  const item = await ctx.db.get(itemId)
  if (!item)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: 'source template item missing',
    })
  }
  return item
}

const loadTemplateItemsById = async (
  ctx: MutationCtx,
  itemIds: readonly Id<'templateItems'>[]
): Promise<Map<Id<'templateItems'>, Doc<'templateItems'>>> =>
{
  const uniqueIds = [...new Set(itemIds)]
  const entries = await Promise.all(
    uniqueIds.map(
      async (itemId) =>
        [itemId, await requireTemplateItem(ctx, itemId)] as const
    )
  )
  return new Map(entries)
}

const requireCompletedTemplateBoard = (
  board: Doc<'boards'>
): Id<'templates'> =>
{
  if (board.deletedAt !== null)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.boardDeleted,
      message: 'cannot publish a deleted board ranking',
    })
  }
  if (board.sourceTemplateId === null)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: 'only template-backed boards can publish rankings',
    })
  }
  if (board.activeItemCount === 0 || board.unrankedItemCount > 0)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: 'only completed template rankings can be published',
    })
  }
  return board.sourceTemplateId
}

interface OrderedRankingItem
{
  boardItem: Doc<'boardItems'>
  tierExternalId: string
  templateItem: Doc<'templateItems'>
  order: number
}

const buildOrderedRankingItems = async (
  ctx: MutationCtx,
  tiers: readonly Doc<'boardTiers'>[],
  items: readonly Doc<'boardItems'>[]
): Promise<OrderedRankingItem[]> =>
{
  const tiersById = new Map(tiers.map((tier) => [tier._id, tier]))
  const activeItems = items.filter((item) => item.deletedAt === null)
  const itemsByTier = new Map<Id<'boardTiers'>, Doc<'boardItems'>[]>()
  const templateItemIds: Id<'templateItems'>[] = []
  for (const item of activeItems)
  {
    const templateItemId = item.templateItemId
    if (item.tierId === null || templateItemId === undefined)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: 'ranking items must be tiered template items',
      })
    }
    templateItemIds.push(templateItemId)
    const tier = tiersById.get(item.tierId)
    if (!tier)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: 'ranking item references a missing tier',
      })
    }
    const bucket = itemsByTier.get(item.tierId) ?? []
    bucket.push(item)
    itemsByTier.set(item.tierId, bucket)
  }

  const templateItemsById = await loadTemplateItemsById(ctx, templateItemIds)
  const sortedTiers = [...tiers].sort((a, b) => a.order - b.order)
  const rows: OrderedRankingItem[] = []
  for (const tier of sortedTiers)
  {
    const tierItems = (itemsByTier.get(tier._id) ?? []).sort(
      (a, b) => a.order - b.order
    )
    for (const item of tierItems)
    {
      const templateItemId = item.templateItemId
      if (templateItemId === undefined)
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.invalidState,
          message: 'ranking item references a missing template item',
        })
      }
      const templateItem = templateItemsById.get(templateItemId)
      if (!templateItem)
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.invalidState,
          message: 'source template item missing',
        })
      }
      rows.push({
        boardItem: item,
        tierExternalId: tier.externalId,
        templateItem,
        order: rows.length,
      })
    }
  }
  return rows
}

export const publishRankingFromBoard = mutation({
  args: {
    boardExternalId: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    visibility: rankingVisibilityValidator,
  },
  returns: marketplaceRankingPublishResultValidator,
  handler: async (ctx, args): Promise<MarketplaceRankingPublishResult> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const board = await requireBoardOwnershipByExternalId(
      ctx,
      args.boardExternalId,
      userId
    )
    const sourceTemplateId = requireCompletedTemplateBoard(board)
    const template = await requireTemplate(ctx, sourceTemplateId)
    if (!isPublishedTemplateRow(template))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: 'source template must still be published',
      })
    }
    assertRankingFitsSingleTransaction(board.activeItemCount, 'publish')

    const { serverTiers, serverItems } = await loadBoundedBoardRows(
      ctx,
      board._id
    )
    const rankingItems = await buildOrderedRankingItems(
      ctx,
      serverTiers,
      serverItems
    )
    if (rankingItems.length !== board.activeItemCount)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: 'ranking item count does not match the board',
      })
    }

    const now = Date.now()
    const slug = await allocateRankingSlug(ctx)
    const title = normalizeRankingTitle(args.title ?? board.title)
    const description = normalizeRankingDescription(args.description)
    const criterion = resolveActiveTemplateCriterion(template)
    const criterionSnapshot = toTemplateCriterionSnapshot(criterion)
    const rankingId = await ctx.db.insert('publishedRankings', {
      slug,
      ownerId: userId,
      sourceTemplateId: template._id,
      sourceBoardId: board._id,
      sourceTemplateSlug: template.slug,
      sourceTemplateTitle: template.title,
      sourceTemplateCategory: template.category,
      sourceCriterionExternalId: criterionSnapshot.externalId,
      sourceCriterionNameSnapshot: criterionSnapshot.name,
      sourceCriterionPromptSnapshot: criterionSnapshot.prompt,
      title,
      description,
      visibility: args.visibility,
      publicationState: 'published',
      isPubliclyListable: args.visibility === 'public',
      itemCount: rankingItems.length,
      tierCount: serverTiers.length,
      remixCount: 0,
      viewCount: 0,
      topScore: 0,
      isFeatured: false,
      featuredRank: null,
      featuredBadge: null,
      createdAt: now,
      updatedAt: now,
    })

    await Promise.all([
      ...serverTiers.map((tier) =>
        ctx.db.insert('publishedRankingTiers', {
          rankingId,
          externalId: tier.externalId,
          name: tier.name,
          description: tier.description ?? null,
          colorSpec: tier.colorSpec,
          rowColorSpec: tier.rowColorSpec ?? null,
          order: tier.order,
        })
      ),
      ...rankingItems.map(
        ({ boardItem, templateItem, tierExternalId, order }) =>
          ctx.db.insert('publishedRankingItems', {
            rankingId,
            templateItemId: templateItem._id,
            templateItemExternalId: templateItem.externalId,
            externalId: boardItem.externalId,
            tierExternalId,
            label: boardItem.label ?? null,
            backgroundColor: boardItem.backgroundColor ?? null,
            altText: boardItem.altText ?? null,
            mediaAssetId: boardItem.mediaAssetId,
            order,
            aspectRatio: boardItem.aspectRatio ?? null,
            imageFit: boardItem.imageFit ?? null,
            transform: boardItem.transform ?? null,
          })
      ),
    ])
    if (args.visibility === 'public')
    {
      await queueTemplateRankingAggregateRecompute(ctx, template._id, now)
    }

    return { slug }
  },
})

export const remixRanking = mutation({
  args: {
    slug: v.string(),
    title: v.optional(v.string()),
  },
  returns: marketplaceRankingRemixResultValidator,
  handler: async (ctx, args): Promise<MarketplaceRankingRemixResult> =>
  {
    if (!isRankingSlug(args.slug))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: 'ranking not found',
      })
    }
    const userId = await requireCurrentUserId(ctx)
    const ranking = await findRankingBySlug(ctx, args.slug)
    if (!ranking || !isPublishedRankingRow(ranking))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: 'ranking not found',
      })
    }
    const template = await requireTemplate(ctx, ranking.sourceTemplateId)
    await assertCanUseTemplate(ctx, userId, template)
    assertRankingFitsSingleTransaction(ranking.itemCount, 'remix')

    const [rankingTiers, rankingItems] = await Promise.all([
      loadRankingTiers(ctx, ranking._id),
      loadRankingItems(ctx, ranking._id),
    ])
    if (rankingItems.length !== ranking.itemCount)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: 'ranking item count does not match the snapshot',
      })
    }

    const now = Date.now()
    const boardExternalId = generateBoardId()
    const boardId = await ctx.db.insert('boards', {
      externalId: boardExternalId,
      ownerId: userId,
      title: normalizeBoardTitle(args.title ?? ranking.title),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      revision: 0,
      sourceTemplateId: template._id,
      sourceTemplateCategory: template.category,
      sourceTemplateSizeClass: template.sizeClass,
      ...buildFreshBoardCloudFields(now),
      itemAspectRatio: template.itemAspectRatio ?? undefined,
      itemAspectRatioMode: template.itemAspectRatioMode ?? undefined,
      defaultItemImageFit: template.defaultItemImageFit ?? undefined,
      labels: template.labels ?? undefined,
      activeItemCount: ranking.itemCount,
      unrankedItemCount: 0,
      templateProgressState: resolveTemplateProgressState(template._id, {
        activeItemCount: ranking.itemCount,
        unrankedItemCount: 0,
      }),
      librarySummary: EMPTY_BOARD_LIBRARY_SUMMARY,
    })

    const tierMap = new Map<
      string,
      { boardTierId: Id<'boardTiers'>; externalId: string; order: number }
    >()
    const summaryTiers: BoardLibrarySummaryTier[] = []
    await Promise.all(
      rankingTiers.map(async (tier) =>
      {
        const externalId = generateTierId()
        const boardTierId = await ctx.db.insert('boardTiers', {
          boardId,
          externalId,
          name: tier.name,
          description: tier.description ?? undefined,
          colorSpec: tier.colorSpec,
          rowColorSpec: tier.rowColorSpec ?? undefined,
          order: tier.order,
        })
        tierMap.set(tier.externalId, {
          boardTierId,
          externalId,
          order: tier.order,
        })
        summaryTiers.push({
          key: externalId,
          order: tier.order,
          colorSpec: tier.colorSpec,
        })
      })
    )

    const summaryItems: BoardLibrarySummaryItem[] = await Promise.all(
      rankingItems.map(async (item) =>
      {
        const tier = item.tierExternalId
          ? tierMap.get(item.tierExternalId)
          : undefined
        if (!tier)
        {
          throw new ConvexError({
            code: CONVEX_ERROR_CODES.invalidState,
            message: 'ranking item references a missing tier',
          })
        }
        const externalId = generateItemId()
        await ctx.db.insert('boardItems', {
          boardId,
          tierId: tier.boardTierId,
          externalId,
          label: item.label ?? undefined,
          backgroundColor: item.backgroundColor ?? undefined,
          altText: item.altText ?? undefined,
          mediaAssetId: item.mediaAssetId,
          order: item.order,
          deletedAt: null,
          aspectRatio: item.aspectRatio ?? undefined,
          imageFit: item.imageFit ?? undefined,
          transform: item.transform ?? undefined,
          templateItemId: item.templateItemId,
        })
        return {
          tierKey: tier.externalId,
          externalId,
          label: item.label,
          storageId: await loadMediaVariantStorageId(ctx, item.mediaAssetId),
          order: item.order,
          deletedAt: null,
        }
      })
    )

    await Promise.all([
      ctx.db.patch(boardId, {
        librarySummary: buildBoardLibrarySummary({
          tiers: summaryTiers,
          items: summaryItems,
        }),
      }),
      ctx.db.patch(ranking._id, {
        remixCount: ranking.remixCount + 1,
        topScore: rankingTopScore({
          viewCount: ranking.viewCount,
          remixCount: ranking.remixCount + 1,
        }),
        updatedAt: now,
      }),
      incrementTemplateUseStats(ctx, template._id, now),
    ])

    return { boardExternalId }
  },
})

export const recordRankingView = mutation({
  args: { slug: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
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

    await ctx.db.patch(ranking._id, {
      viewCount: ranking.viewCount + 1,
      topScore: rankingTopScore({
        viewCount: ranking.viewCount + 1,
        remixCount: ranking.remixCount,
      }),
    })
    return null
  },
})

// curation hooks — pre-1.0 we drive these from the Convex dashboard or the
// seed action below. promote/demote a published ranking into the rail's
// Featured tab. featuredRank is small-first; ties broken by updatedAt
export const markRankingFeaturedImpl = internalMutation({
  args: {
    slug: v.string(),
    featuredRank: v.number(),
    featuredBadge: rankingFeaturedBadgeValidator,
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    if (!isRankingSlug(args.slug))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: 'ranking not found',
      })
    }
    const ranking = await findRankingBySlug(ctx, args.slug)
    if (!ranking || !isPublishedRankingRow(ranking))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: 'ranking not found',
      })
    }
    await ctx.db.patch(ranking._id, {
      isFeatured: true,
      featuredRank: args.featuredRank,
      featuredBadge: args.featuredBadge,
      updatedAt: Date.now(),
    })
    return null
  },
})

export const unmarkRankingFeaturedImpl = internalMutation({
  args: { slug: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    if (!isRankingSlug(args.slug))
    {
      return null
    }
    const ranking = await findRankingBySlug(ctx, args.slug)
    if (!ranking) return null
    await ctx.db.patch(ranking._id, {
      isFeatured: false,
      featuredRank: null,
      featuredBadge: null,
      updatedAt: Date.now(),
    })
    return null
  },
})
