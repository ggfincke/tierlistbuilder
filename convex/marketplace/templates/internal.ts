// convex/marketplace/templates/internal.ts
// internal template maintenance helpers shared by user-data cleanup flows

import { v, type Infer } from 'convex/values'
import { internalMutation, type MutationCtx } from '../../_generated/server'
import { internal } from '../../_generated/api'
import type { Doc, Id } from '../../_generated/dataModel'
import { BATCH_LIMITS } from '../../lib/limits'
import {
  CASCADE_DELETE_PAGE_SIZE,
  runCascadePhaseMachine,
} from '../../lib/cascadeDelete'
import {
  deleteTemplateRankingAggregateParentRows,
  rollupTemplateRankingCount,
} from '../rankings/aggregate/lib'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { LIBRARY_BOARD_COVER_ITEM_LIMIT } from '@tierlistbuilder/contracts/workspace/board'
import {
  getLargeTemplateFeatureState,
  getPlanEntitlements,
} from '../../lib/entitlements'
import { loadPreviewOrTileStorageId } from '../../lib/mediaVariants'
import { buildBoardLibrarySummary } from '../../workspace/boards/librarySummary'
import {
  adjustPublicTemplateCount,
  buildBoardItemInsertFromTemplateItem,
  buildTemplateStateFields,
  calculateTemplateTrendingScore,
  deleteTemplateParentForCascade,
  getTemplateMetricDayStart,
  TEMPLATE_TRENDING_DAY_MS,
  TEMPLATE_TRENDING_WINDOW_DAYS,
  incrementTemplateForkStats,
  isActiveTemplateJob,
  isPublishedTemplateRow,
  markTemplateNotPublic,
  patchTemplateAndSyncCard,
  setSourceBoardLivePublicTemplate,
  syncTemplateTagRows,
  writeTemplateCardPreservingCounters,
} from './lib'

const cascadePhaseValidator = v.union(
  v.literal('items'),
  v.literal('tags'),
  v.literal('bookmarks'),
  v.literal('aggregateItems')
)
type CascadePhase = Infer<typeof cascadePhaseValidator>

type TemplateCloneJob = Doc<'templateCloneJobs'>

const markPublishJobFailed = async (
  ctx: MutationCtx,
  job: Doc<'templatePublishJobs'>,
  errorCode: string,
  now: number
): Promise<void> =>
{
  const [template] = await Promise.all([
    ctx.db.get(job.targetTemplateId),
    ctx.db.patch(job._id, {
      status: 'failed',
      errorCode,
      updatedAt: now,
      completedAt: now,
    }),
  ])
  if (!template) return

  await markTemplateNotPublic(ctx, template, now, 'publishFailed', {
    clearSourceBoard: false,
  })
}

const markCloneJobFailed = async (
  ctx: MutationCtx,
  job: TemplateCloneJob,
  errorCode: string,
  now: number
): Promise<void> =>
{
  const boardPromise = ctx.db.get(job.targetBoardId)
  await ctx.db.patch(job._id, {
    status: 'failed',
    errorCode,
    updatedAt: now,
    completedAt: now,
  })

  const board = await boardPromise
  if (board)
  {
    await ctx.db.patch(board._id, {
      materializationState: 'cloneFailed',
      updatedAt: now,
    })
  }
}

const allMediaAssetsHaveReadyTileVariants = async (
  ctx: MutationCtx,
  mediaAssetIds: readonly (Id<'mediaAssets'> | null)[]
): Promise<boolean> =>
{
  const uniqueIds = [...new Set(mediaAssetIds.filter((id) => id !== null))]
  const assets = await Promise.all(uniqueIds.map((id) => ctx.db.get(id)))
  return assets.every((asset) => !!asset?.tileVariant)
}

const assertLargeJobCanContinue = async (
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  planErrorCode: string
): Promise<string | null> =>
{
  const entitlements = await getPlanEntitlements(ctx, ownerId)
  if (entitlements.plan !== 'plus')
  {
    return planErrorCode
  }
  return getLargeTemplateFeatureState() === 'public'
    ? null
    : CONVEX_ERROR_CODES.largeTemplateFeatureNotReady
}

export const processTemplatePublishJob = internalMutation({
  args: { jobId: v.id('templatePublishJobs') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const job = await ctx.db.get(args.jobId)
    if (!job || !isActiveTemplateJob(job.status)) return null

    const now = Date.now()
    const gateError = await assertLargeJobCanContinue(
      ctx,
      job.ownerId,
      CONVEX_ERROR_CODES.publishPausedForPlan
    )
    if (gateError)
    {
      await markPublishJobFailed(ctx, job, gateError, now)
      return null
    }

    const [board, template] = await Promise.all([
      ctx.db.get(job.sourceBoardId),
      ctx.db.get(job.targetTemplateId),
    ])
    if (!board || board.deletedAt !== null || board.ownerId !== job.ownerId)
    {
      await markPublishJobFailed(ctx, job, CONVEX_ERROR_CODES.boardDeleted, now)
      return null
    }
    if (!template || template.authorId !== job.ownerId)
    {
      await markPublishJobFailed(ctx, job, CONVEX_ERROR_CODES.notFound, now)
      return null
    }
    if (
      board.revision !== job.sourceBoardRevision ||
      board.activeItemCount !== job.itemCount
    )
    {
      await markPublishJobFailed(ctx, job, CONVEX_ERROR_CODES.invalidState, now)
      return null
    }

    const page = await ctx.db
      .query('boardItems')
      .withIndex('byBoardDeletedAtOrder', (q) =>
        q.eq('boardId', board._id).eq('deletedAt', null)
      )
      .paginate({
        numItems: BATCH_LIMITS.templateCopyJob,
        cursor: job.nextCursor,
      })

    const hasReadyTiles = await allMediaAssetsHaveReadyTileVariants(
      ctx,
      page.page.map((item) => item.mediaAssetId)
    )
    if (!hasReadyTiles)
    {
      await markPublishJobFailed(ctx, job, CONVEX_ERROR_CODES.invalidState, now)
      return null
    }

    const existingEntries = await Promise.all(
      page.page.map(async (item) => ({
        item,
        existing: await ctx.db
          .query('templateItems')
          .withIndex('byTemplateAndExternalId', (q) =>
            q.eq('templateId', template._id).eq('externalId', item.externalId)
          )
          .unique(),
      }))
    )
    await Promise.all(
      existingEntries
        .filter(({ existing }) => !existing)
        .map(({ item }) =>
          ctx.db.insert('templateItems', {
            templateId: template._id,
            externalId: item.externalId,
            label: item.label ?? null,
            backgroundColor: item.backgroundColor ?? null,
            altText: item.altText ?? null,
            mediaAssetId: item.mediaAssetId,
            order: item.order,
            aspectRatio: item.aspectRatio ?? null,
            imageFit: item.imageFit ?? null,
            transform: item.transform ?? null,
          })
        )
    )

    const processedItemCount = job.processedItemCount + page.page.length
    if (!page.isDone)
    {
      await ctx.db.patch(job._id, {
        status: 'running',
        processedItemCount,
        nextCursor: page.continueCursor,
        errorCode: null,
        startedAt: job.startedAt ?? now,
        updatedAt: now,
      })
      await ctx.scheduler.runAfter(
        0,
        internal.marketplace.templates.internal.processTemplatePublishJob,
        { jobId: job._id }
      )
      return null
    }

    if (processedItemCount !== job.itemCount)
    {
      await markPublishJobFailed(ctx, job, CONVEX_ERROR_CODES.invalidState, now)
      return null
    }

    const templatePatch = {
      ...buildTemplateStateFields(job.itemCount, template.visibility),
      updatedAt: now,
    }
    const nextTemplate = await patchTemplateAndSyncCard(
      ctx,
      template,
      templatePatch
    )
    if (templatePatch.isPubliclyListable)
    {
      await adjustPublicTemplateCount(ctx, [
        { category: template.category, delta: 1 },
      ])
      await setSourceBoardLivePublicTemplate(ctx, board, template._id, now)
    }
    await syncTemplateTagRows(ctx, nextTemplate)
    await ctx.db.patch(job._id, {
      status: 'succeeded',
      processedItemCount,
      nextCursor: page.continueCursor,
      errorCode: null,
      startedAt: job.startedAt ?? now,
      completedAt: now,
      updatedAt: now,
    })
    return null
  },
})

const buildCloneBoardSummary = async (
  ctx: MutationCtx,
  boardId: Id<'boards'>
) =>
{
  const [tiers, items] = await Promise.all([
    ctx.db
      .query('boardTiers')
      .withIndex('byBoard', (q) => q.eq('boardId', boardId))
      .take(BATCH_LIMITS.cascadeDelete),
    ctx.db
      .query('boardItems')
      .withIndex('byBoardAndTier', (q) =>
        q.eq('boardId', boardId).eq('tierId', null)
      )
      .take(LIBRARY_BOARD_COVER_ITEM_LIMIT),
  ])
  const summaryItems = await Promise.all(
    items.map(async (item) => ({
      tierKey: null,
      externalId: item.externalId,
      label: item.label,
      storageId: await loadPreviewOrTileStorageId(ctx, item.mediaAssetId),
      order: item.order,
      deletedAt: item.deletedAt,
    }))
  )
  return buildBoardLibrarySummary({
    tiers: tiers.map((tier, order) => ({
      key: String(order),
      order,
      colorSpec: tier.colorSpec,
    })),
    items: summaryItems,
  })
}

export const processTemplateCloneJob = internalMutation({
  args: { jobId: v.id('templateCloneJobs') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const job = await ctx.db.get(args.jobId)
    if (!job || !isActiveTemplateJob(job.status)) return null

    const now = Date.now()
    const gateError = await assertLargeJobCanContinue(
      ctx,
      job.ownerId,
      CONVEX_ERROR_CODES.largeTemplateRequiresPlus
    )
    if (gateError)
    {
      await markCloneJobFailed(ctx, job, gateError, now)
      return null
    }

    const [template, board] = await Promise.all([
      ctx.db.get(job.sourceTemplateId),
      ctx.db.get(job.targetBoardId),
    ])
    if (!template || !isPublishedTemplateRow(template))
    {
      await markCloneJobFailed(ctx, job, CONVEX_ERROR_CODES.notFound, now)
      return null
    }
    if (!board || board.deletedAt !== null || board.ownerId !== job.ownerId)
    {
      await markCloneJobFailed(ctx, job, CONVEX_ERROR_CODES.boardDeleted, now)
      return null
    }

    const page = await ctx.db
      .query('templateItems')
      .withIndex('byTemplate', (q) => q.eq('templateId', template._id))
      .paginate({
        numItems: BATCH_LIMITS.templateCopyJob,
        cursor: job.nextCursor,
      })

    const hasReadyTiles = await allMediaAssetsHaveReadyTileVariants(
      ctx,
      page.page.map((item) => item.mediaAssetId)
    )
    if (!hasReadyTiles)
    {
      await markCloneJobFailed(ctx, job, CONVEX_ERROR_CODES.invalidState, now)
      return null
    }

    const existingEntries = await Promise.all(
      page.page.map(async (item) => ({
        item,
        existing: await ctx.db
          .query('boardItems')
          .withIndex('byBoardAndTemplateItem', (q) =>
            q.eq('boardId', board._id).eq('templateItemId', item._id)
          )
          .unique(),
      }))
    )
    await Promise.all(
      existingEntries
        .filter(({ existing }) => !existing)
        .map(({ item }) =>
          ctx.db.insert(
            'boardItems',
            buildBoardItemInsertFromTemplateItem(board._id, item)
          )
        )
    )

    const processedItemCount = job.processedItemCount + page.page.length
    if (!page.isDone)
    {
      await ctx.db.patch(job._id, {
        status: 'running',
        processedItemCount,
        nextCursor: page.continueCursor,
        errorCode: null,
        startedAt: job.startedAt ?? now,
        updatedAt: now,
      })
      await ctx.scheduler.runAfter(
        0,
        internal.marketplace.templates.internal.processTemplateCloneJob,
        { jobId: job._id }
      )
      return null
    }

    if (processedItemCount !== job.itemCount)
    {
      await markCloneJobFailed(ctx, job, CONVEX_ERROR_CODES.invalidState, now)
      return null
    }

    const librarySummary = await buildCloneBoardSummary(ctx, board._id)
    await ctx.db.patch(board._id, {
      materializationState: 'ready',
      activeItemCount: job.itemCount,
      unrankedItemCount: job.itemCount,
      // large clone has now materialized — tick the counter & flip the flag
      // so a later sync doesn't double-count
      forkCounted: true,
      librarySummary,
      updatedAt: now,
    })
    await incrementTemplateForkStats(ctx, template._id, now)
    await ctx.db.patch(job._id, {
      status: 'succeeded',
      processedItemCount,
      nextCursor: page.continueCursor,
      errorCode: null,
      startedAt: job.startedAt ?? now,
      completedAt: now,
      updatedAt: now,
    })
    return null
  },
})

export const cascadeDeleteTemplate = internalMutation({
  args: {
    templateId: v.id('templates'),
    cursor: v.optional(v.union(v.string(), v.null())),
    phase: v.optional(cascadePhaseValidator),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const template = await ctx.db.get(args.templateId)
    if (template)
    {
      await deleteTemplateParentForCascade(ctx, template)
    }

    const phase: CascadePhase = args.phase ?? 'items'
    const scheduled = await runCascadePhaseMachine({
      ctx,
      schedule: async (nextArgs) =>
        await ctx.scheduler.runAfter(
          0,
          internal.marketplace.templates.internal.cascadeDeleteTemplate,
          nextArgs
        ),
      parentKey: 'templateId',
      parentId: args.templateId,
      phase,
      cursor: args.cursor,
      phases: [
        {
          phase: 'items',
          page: async (cursor) =>
            await ctx.db
              .query('templateItems')
              .withIndex('byTemplate', (q) =>
                q.eq('templateId', args.templateId)
              )
              .paginate({
                numItems: CASCADE_DELETE_PAGE_SIZE,
                cursor,
              }),
        },
        {
          phase: 'tags',
          page: async (cursor) =>
            await ctx.db
              .query('templateTags')
              .withIndex('byTemplate', (q) =>
                q.eq('templateId', args.templateId)
              )
              .paginate({
                numItems: CASCADE_DELETE_PAGE_SIZE,
                cursor,
              }),
        },
        {
          phase: 'bookmarks',
          page: async (cursor) =>
            await ctx.db
              .query('userTemplateBookmarks')
              .withIndex('byTemplateUser', (q) =>
                q.eq('templateId', args.templateId)
              )
              .paginate({
                numItems: CASCADE_DELETE_PAGE_SIZE,
                cursor,
              }),
        },
        {
          phase: 'aggregateItems',
          page: async (cursor) =>
            await ctx.db
              .query('templateRankingAggregateItems')
              .withIndex('byTemplateIdAndOrder', (q) =>
                q.eq('templateId', args.templateId)
              )
              .paginate({
                numItems: CASCADE_DELETE_PAGE_SIZE,
                cursor,
              }),
        },
      ],
    })
    if (scheduled) return null

    await deleteTemplateRankingAggregateParentRows(ctx, args.templateId)

    return null
  },
})

export const syncTemplateCardsForAuthor = internalMutation({
  args: {
    authorId: v.id('users'),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const page = await ctx.db
      .query('templates')
      .withIndex('byAuthorUpdatedAt', (q) => q.eq('authorId', args.authorId))
      .paginate({
        numItems: BATCH_LIMITS.cascadeDelete,
        cursor: args.cursor ?? null,
      })

    await Promise.all(
      page.page.map((template) =>
        writeTemplateCardPreservingCounters(ctx, template)
      )
    )

    if (!page.isDone)
    {
      await ctx.scheduler.runAfter(
        0,
        internal.marketplace.templates.internal.syncTemplateCardsForAuthor,
        { authorId: args.authorId, cursor: page.continueCursor }
      )
    }
    return null
  },
})

const recomputeTemplateTrendingForCard = async (
  ctx: MutationCtx,
  card: Doc<'templateCards'>,
  now: number
): Promise<void> =>
{
  const windowStart =
    getTemplateMetricDayStart(now) -
    (TEMPLATE_TRENDING_WINDOW_DAYS - 1) * TEMPLATE_TRENDING_DAY_MS
  const metricRows = await ctx.db
    .query('templateMetricDays')
    .withIndex('byTemplateDay', (q) =>
      q.eq('templateId', card.templateId).gt('dayStartAt', windowStart - 1)
    )
    .take(TEMPLATE_TRENDING_WINDOW_DAYS)
  let weeklyForkCount = 0
  let weeklyViewCount = 0
  for (const row of metricRows)
  {
    weeklyForkCount += row.forkCount
    weeklyViewCount += row.viewCount
  }
  const trendingScore = calculateTemplateTrendingScore({
    weeklyForkCount,
    weeklyViewCount,
    createdAt: card.createdAt,
    now,
  })

  await ctx.db.patch(card._id, {
    weeklyForkCount,
    weeklyViewCount,
    trendingScore,
    trendingComputedAt: now,
  })
}

export const recomputeTemplateTrendingScores = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    now: v.optional(v.number()),
  },
  returns: v.object({ processed: v.number(), isDone: v.boolean() }),
  handler: async (
    ctx,
    args
  ): Promise<{ processed: number; isDone: boolean }> =>
  {
    const now = args.now ?? Date.now()
    const page = await ctx.db
      .query('templateCards')
      .withIndex('byIsPubliclyListableUpdatedAt', (q) =>
        q.eq('isPubliclyListable', true)
      )
      .paginate({
        numItems: BATCH_LIMITS.templateTrendingRecompute,
        cursor: args.cursor,
      })

    await Promise.all(
      page.page.map((card) => recomputeTemplateTrendingForCard(ctx, card, now))
    )

    if (!page.isDone)
    {
      await ctx.scheduler.runAfter(
        0,
        internal.marketplace.templates.internal.recomputeTemplateTrendingScores,
        { cursor: page.continueCursor, now }
      )
    }

    return { processed: page.page.length, isDone: page.isDone }
  },
})

// one-time backfill for templateCards.rankingCount, which landed after these
// rows were last written. paginates every card & re-derives the count via the
// same rollup the aggregate job uses. idempotent - safe to re-run after seeds
export const backfillTemplateCardRankingCount = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({ processed: v.number(), isDone: v.boolean() }),
  handler: async (
    ctx,
    args
  ): Promise<{ processed: number; isDone: boolean }> =>
  {
    const page = await ctx.db.query('templateCards').paginate({
      numItems: BATCH_LIMITS.templateTrendingRecompute,
      cursor: args.cursor,
    })

    await Promise.all(
      page.page.map((card) => rollupTemplateRankingCount(ctx, card.templateId))
    )

    if (!page.isDone)
    {
      await ctx.scheduler.runAfter(
        0,
        internal.marketplace.templates.internal
          .backfillTemplateCardRankingCount,
        { cursor: page.continueCursor }
      )
    }

    return { processed: page.page.length, isDone: page.isDone }
  },
})
