// convex/marketplace/rankings/public/mutations.ts
// publish completed template rankings & remix consensus aggregates into boards

import { ConvexError, v } from 'convex/values'
import {
  internalMutation,
  mutation,
  type MutationCtx,
} from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import type { Doc, Id } from '../../../_generated/dataModel'
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
import { isTemplateSlug } from '@tierlistbuilder/contracts/marketplace/template'
import { MAX_LARGE_CLOUD_BOARD_ITEMS } from '@tierlistbuilder/contracts/workspace/cloudBoard'
import {
  assertCanUseTemplate,
  assertRankingFitsSingleTransaction,
} from '../../../lib/entitlements'
import { getCurrentUserId, requireCurrentUserId } from '../../../lib/auth'
import { requireBoardOwnershipByExternalId } from '../../../lib/permissions'
import { enforceRateLimit } from '../../../lib/rateLimiter'
import {
  findRankingBySlug,
  findTemplateBySlug,
} from '../../../lib/marketplaceLookups'
import { loadPreviewOrTileStorageId } from '../../../lib/mediaVariants'
import { loadBoundedBoardRows } from '../../../workspace/sync/loadBoundedBoardRows'
import { buildFreshBoardCloudFields } from '../../../workspace/boards/cloudFields'
import {
  buildBoardLibrarySummary,
  EMPTY_BOARD_LIBRARY_SUMMARY,
  type BoardLibrarySummaryItem,
  type BoardLibrarySummaryTier,
} from '../../../workspace/boards/librarySummary'
import {
  EMPTY_BOARD_SOURCE_RANKING,
  boardSourceTemplateFromTemplate,
  getBoardSourceTemplateId,
} from '../../../workspace/boards/sourceFields'
import { resolveTemplateProgressState } from '../../../lib/templateProgress'
import {
  marketplaceRankingPublishResultValidator,
  marketplaceRankingRemixResultValidator,
  rankingFeaturedBadgeValidator,
  rankingVisibilityValidator,
} from '../../../lib/validators/marketplace'
import {
  allocateRankingSlug,
  isPublicRankingRow,
  isPublishedRankingRow,
  normalizeRankingDescription,
  normalizeRankingTitle,
  rankingTopScore,
} from '../lib'
import { DEFAULT_TEMPLATE_TIERS } from '../../templates/lib/normalize'
import { loadTemplateItems } from '../../templates/lib/projections'
import { incrementTemplateForkStats } from '../../templates/lib/writes'
import { isPublishedTemplateRow } from '../../templates/lib/state'
import { templateTitleToBoardTitle } from '../../templates/lib/board'
import {
  resolveActiveTemplateCriterion,
  toTemplateCriterionSnapshot,
} from '../../templates/criteria'
import {
  findTemplateRankingAggregate,
  queueTemplateRankingAggregateRecompute,
} from '../aggregate/lib'

const SUPERSEDE_PUBLIC_RANKINGS_PAGE_SIZE = 256

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

const loadTemplateItemsByIds = async (
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
  const sourceTemplateId = getBoardSourceTemplateId(board)
  if (sourceTemplateId === null)
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
  return sourceTemplateId
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

  const templateItemsById = await loadTemplateItemsByIds(ctx, templateItemIds)
  const sortedTiers = [...tiers].sort((a, b) => a.order - b.order)
  // one ranking row per templateItem — two tiles linked to the same source item
  // would emit duplicate rows the per-templateItem aggregate counts
  // inconsistently (once if co-paged, twice if split). keep the first placement
  const seenTemplateItemIds = new Set<Id<'templateItems'>>()
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
      if (seenTemplateItemIds.has(templateItemId)) continue
      const templateItem = templateItemsById.get(templateItemId)
      if (!templateItem)
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.invalidState,
          message: 'source template item missing',
        })
      }
      seenTemplateItemIds.add(templateItemId)
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

const supersedePublicRankingsInLane = async (
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  templateId: Id<'templates'>,
  criterionExternalId: string,
  replacementRankingId: Id<'publishedRankings'>,
  now: number
): Promise<void> =>
  await supersedePublicRankingsInLanePage(ctx, {
    ownerId,
    templateId,
    criterionExternalId,
    replacementRankingId,
    now,
    cursor: null,
  })

interface SupersedePublicRankingsInLaneArgs
{
  ownerId: Id<'users'>
  templateId: Id<'templates'>
  criterionExternalId: string
  replacementRankingId: Id<'publishedRankings'>
  now: number
  cursor: string | null
}

const supersedePublicRankingsInLanePage = async (
  ctx: MutationCtx,
  args: SupersedePublicRankingsInLaneArgs
): Promise<void> =>
{
  const patchBatch: Promise<void>[] = []
  const flushPatchBatch = async () =>
  {
    await Promise.all(patchBatch)
    patchBatch.length = 0
  }
  const page = await ctx.db
    .query('publishedRankings')
    .withIndex('bySourceTemplateCriterionOwnerPublicCreatedAt', (q) =>
      q
        .eq('sourceTemplateId', args.templateId)
        .eq('sourceCriterionExternalId', args.criterionExternalId)
        .eq('ownerId', args.ownerId)
        .eq('isPubliclyListable', true)
    )
    .paginate({
      numItems: SUPERSEDE_PUBLIC_RANKINGS_PAGE_SIZE,
      cursor: args.cursor,
    })
  for (const ranking of page.page)
  {
    if (ranking._id === args.replacementRankingId) continue
    if (!isPublicRankingRow(ranking)) continue
    patchBatch.push(
      ctx.db.patch(ranking._id, {
        isPubliclyListable: false,
        supersededAt: args.now,
        supersededByRankingId: args.replacementRankingId,
        updatedAt: args.now,
      })
    )
    if (patchBatch.length >= 16)
    {
      await flushPatchBatch()
    }
  }
  await flushPatchBatch()
  if (!page.isDone)
  {
    await ctx.scheduler.runAfter(
      0,
      internal.marketplace.rankings.public.mutations
        .supersedePublicRankingsInLaneBatch,
      { ...args, cursor: page.continueCursor }
    )
  }
}

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
    await supersedePublicRankingsInLanePage(ctx, args)
    return null
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
    const userId = await requireCurrentUserId(ctx)
    // every public publish below queues an aggregate recompute, so the
    // bucket bounds downstream cost as well as the surface mutation itself
    await enforceRateLimit(ctx, 'userRankingPublish', userId)
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
    const criterion = resolveActiveTemplateCriterion(
      template,
      args.criterionExternalId
    )
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
      supersededAt: null,
      supersededByRankingId: null,
      itemCount: rankingItems.length,
      tierCount: serverTiers.length,
      remixCount: 0,
      viewCount: 0,
      topScore: 0,
      isFeatured: false,
      featuredRank: null,
      featuredBadge: null,
      seedDatasetKey: null,
      seedReleaseId: null,
      seedExternalId: null,
      seedKind: null,
      seedTemplateExternalId: null,
      seedCriterionExternalId: null,
      seedAuthorKey: null,
      seedProfileKey: null,
      seedCuratedExternalId: null,
      seedReleaseStatus: null,
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
            mediaPlate: boardItem.mediaPlate ?? null,
            altText: boardItem.altText ?? null,
            mediaAssetId: boardItem.mediaAssetId,
            order,
            aspectRatio: boardItem.aspectRatio ?? null,
            imageFit: boardItem.imageFit ?? null,
            transform: boardItem.transform ?? null,
            imagePadding: boardItem.imagePadding ?? null,
          })
      ),
    ])
    if (args.visibility === 'public')
    {
      await supersedePublicRankingsInLane(
        ctx,
        userId,
        template._id,
        criterion.externalId,
        rankingId,
        now
      )
      await queueTemplateRankingAggregateRecompute(
        ctx,
        template._id,
        criterion.externalId,
        now
      )
    }

    return { slug }
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
    if (!isTemplateSlug(args.templateSlug))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: 'template not found',
      })
    }
    const userId = await requireCurrentUserId(ctx)
    // throttle before the board insert so a script can't mass-create boards or
    // inflate the source template's remix/fork stats
    await enforceRateLimit(ctx, 'userRankingRemix', userId)
    const template = await findTemplateBySlug(ctx, args.templateSlug)
    if (!template || !isPublishedTemplateRow(template))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: 'template not found',
      })
    }
    await assertCanUseTemplate(ctx, userId, template)

    const criterion = resolveActiveTemplateCriterion(
      template,
      args.criterionExternalId
    )
    const aggregate = await findTemplateRankingAggregate(
      ctx,
      template._id,
      criterion.externalId
    )
    if (
      !aggregate ||
      aggregate.rankingCount === 0 ||
      aggregate.activeGeneration === null
    )
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: 'consensus not available — no rankings yet',
      })
    }
    const activeGeneration = aggregate.activeGeneration

    // bounded read of every aggregate item for the active generation; the
    // aggregate row count is bounded by the source template's item count
    const aggregateItems = await ctx.db
      .query('templateRankingAggregateItems')
      .withIndex('byTemplateIdAndCriterionAndGenerationAndOrder', (q) =>
        q
          .eq('templateId', template._id)
          .eq('criterionExternalId', criterion.externalId)
          .eq('generation', activeGeneration)
      )
      .take(MAX_LARGE_CLOUD_BOARD_ITEMS + 1)
    if (aggregateItems.length > MAX_LARGE_CLOUD_BOARD_ITEMS)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.syncLimitExceeded,
        message: `aggregate item rows exceed ${MAX_LARGE_CLOUD_BOARD_ITEMS}`,
      })
    }

    // map templateItem._id -> consensus bucket index; unsampled/null stay unranked
    const placementByTemplateItemId = new Map<Id<'templateItems'>, number>()
    for (const item of aggregateItems)
    {
      if (item.sampleCount > 0 && item.topBucketIndex !== null)
      {
        placementByTemplateItemId.set(item.templateItemId, item.topBucketIndex)
      }
    }

    assertRankingFitsSingleTransaction(template.itemCount, 'remix')

    const templateItems = await loadTemplateItems(ctx, template._id)
    if (templateItems.length === 0)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: 'template has no items',
      })
    }
    await assertCanUseTemplate(ctx, userId, {
      itemCount: templateItems.length,
    })

    const tierTemplate =
      template.suggestedTiers.length > 0
        ? template.suggestedTiers
        : DEFAULT_TEMPLATE_TIERS
    const boardTitle = normalizeBoardTitle(
      args.title ?? templateTitleToBoardTitle(template.title)
    )

    let unrankedItemCount = 0
    const consensusItems = templateItems.map((item) =>
    {
      const bucket = placementByTemplateItemId.get(item._id)
      const tierIndex =
        bucket !== undefined && bucket >= 0 && bucket < tierTemplate.length
          ? bucket
          : null
      if (tierIndex === null)
      {
        unrankedItemCount++
      }
      return { item, tierIndex }
    })
    const progressCounts = {
      activeItemCount: templateItems.length,
      unrankedItemCount,
    }

    const now = Date.now()
    const boardExternalId = generateBoardId()
    const boardId = await ctx.db.insert('boards', {
      externalId: boardExternalId,
      ownerId: userId,
      title: boardTitle,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      revision: 0,
      sourceTemplate: boardSourceTemplateFromTemplate(template),
      // consensus remix is sourced from the aggregate, not a single ranking
      sourceRanking: EMPTY_BOARD_SOURCE_RANKING,
      forkCounted: true,
      preferredCriterionExternalId: criterion.externalId,
      ...buildFreshBoardCloudFields(now),
      materializationState: 'ready',
      itemAspectRatio: template.itemAspectRatio ?? null,
      itemAspectRatioMode: template.itemAspectRatioMode ?? null,
      aspectRatioPromptDismissed: false,
      defaultItemImageFit: template.defaultItemImageFit ?? null,
      defaultItemImagePadding: template.defaultItemImagePadding ?? null,
      paletteId: null,
      textStyleId: null,
      pageBackground: null,
      labels: template.labels ?? null,
      autoPlate: template.autoPlate,
      ...progressCounts,
      templateProgressState: resolveTemplateProgressState(
        template._id,
        progressCounts
      ),
      librarySummary: EMPTY_BOARD_LIBRARY_SUMMARY,
      seedDatasetKey: null,
      seedReleaseId: null,
      seedExternalId: null,
      seedContentHash: null,
      seedKind: null,
      seedReleaseStatus: null,
    })

    interface InsertedTier
    {
      id: Id<'boardTiers'>
      externalId: string
      order: number
    }
    const insertedTiers: InsertedTier[] = await Promise.all(
      tierTemplate.map(async (tier, order) =>
      {
        const externalId = generateTierId()
        const id = await ctx.db.insert('boardTiers', {
          boardId,
          externalId,
          name: tier.name,
          description: tier.description,
          colorSpec: tier.colorSpec,
          rowColorSpec: tier.rowColorSpec,
          order,
        })
        return { id, externalId, order }
      })
    )
    const summaryTiers: BoardLibrarySummaryTier[] = insertedTiers.map(
      (tier, order) => ({
        key: tier.externalId,
        order,
        colorSpec: tierTemplate[order].colorSpec,
      })
    )

    const summaryItems: BoardLibrarySummaryItem[] = await Promise.all(
      consensusItems.map(async ({ item, tierIndex }) =>
      {
        const tier =
          tierIndex === null ? null : (insertedTiers[tierIndex] ?? null)
        const externalId = generateItemId()
        const storageId = item.mediaAssetId
          ? await loadPreviewOrTileStorageId(ctx, item.mediaAssetId)
          : null
        await ctx.db.insert('boardItems', {
          boardId,
          tierId: tier?.id ?? null,
          externalId,
          label: item.label ?? undefined,
          backgroundColor: item.backgroundColor ?? undefined,
          mediaPlate: item.mediaPlate ?? undefined,
          altText: item.altText ?? undefined,
          mediaAssetId: item.mediaAssetId,
          order: item.order,
          deletedAt: null,
          aspectRatio: item.aspectRatio ?? undefined,
          imageFit: item.imageFit ?? undefined,
          transform: item.transform ?? undefined,
          imagePadding: item.imagePadding ?? undefined,
          templateItemId: item._id,
        })
        return {
          tierKey: tier?.externalId ?? null,
          externalId,
          label: item.label,
          storageId,
          order: item.order,
          deletedAt: null,
        }
      })
    )

    await ctx.db.patch(boardId, {
      librarySummary: buildBoardLibrarySummary({
        tiers: summaryTiers,
        items: summaryItems,
      }),
    })
    await incrementTemplateForkStats(ctx, template, now)

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
    const userId = await getCurrentUserId(ctx)
    if (!userId)
    {
      return null
    }
    // scoped per (user, slug) so refresh-spam on one ranking depletes only
    // its own bucket — browsing many rankings never throttles itself.
    await enforceRateLimit(ctx, 'userRankingView', userId, {
      scope: args.slug,
    })
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
