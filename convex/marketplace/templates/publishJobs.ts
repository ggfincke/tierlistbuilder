// convex/marketplace/templates/publishJobs.ts
// template publish & clone job queue, retry, & cancel mutations

import { ConvexError, v } from 'convex/values'
import { mutation, type MutationCtx } from '../../_generated/server'
import { internal } from '../../_generated/api'
import type { Doc, Id } from '../../_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { generateBoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { TemplateCategory } from '@tierlistbuilder/contracts/marketplace/category'
import type { TierPresetTier } from '@tierlistbuilder/contracts/workspace/tierPreset'
import {
  ACTIVE_TEMPLATE_JOB_STATUSES,
  MAX_TEMPLATE_COVER_ITEMS,
  isFinishedTemplateJobStatus,
  type MarketplaceTemplatePublishResult,
  type MarketplaceTemplateUseResult,
  type TemplateCoverFraming,
} from '@tierlistbuilder/contracts/marketplace/template'
import { MAX_STANDARD_CLOUD_BOARD_ITEMS } from '@tierlistbuilder/contracts/workspace/cloudBoard'
import { requireCurrentUserId } from '../../lib/auth'
import { firstActiveStatusRow } from '../../lib/jobs'
import { buildForkedBoardInsert } from '../../workspace/boards/cloudFields'
import { buildTemplateStateFields } from './lib/state'
import {
  allocateTemplateSlug,
  insertTemplateWithStatsAndCard,
} from './lib/writes'
import { insertBoardTiers } from './lib/board'
import { tiersFromBoardRows, validateTemplateTiers } from './lib/normalize'
import {
  buildTemplateInsertFields,
  isMediaBackedBoardItem,
  resolveCoverFraming,
  resolveCoverMediaId,
  toTemplateCoverItem,
} from './lib/publishing'

const findActivePublishJobForBoard = async (
  ctx: MutationCtx,
  sourceBoardId: Id<'boards'>
): Promise<Doc<'templatePublishJobs'> | null> =>
  await firstActiveStatusRow(
    ACTIVE_TEMPLATE_JOB_STATUSES,
    async (status) =>
      await ctx.db
        .query('templatePublishJobs')
        .withIndex('bySourceBoardStatus', (q) =>
          q.eq('sourceBoardId', sourceBoardId).eq('status', status)
        )
        .take(1)
  )

const findActiveCloneJobForTemplate = async (
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  sourceTemplateId: Id<'templates'>
): Promise<Doc<'templateCloneJobs'> | null> =>
  await firstActiveStatusRow(
    ACTIVE_TEMPLATE_JOB_STATUSES,
    async (status) =>
      await ctx.db
        .query('templateCloneJobs')
        .withIndex('byOwnerSourceTemplateStatus', (q) =>
          q
            .eq('ownerId', ownerId)
            .eq('sourceTemplateId', sourceTemplateId)
            .eq('status', status)
        )
        .take(1)
  )

const loadBoardTiersForTemplate = async (
  ctx: MutationCtx,
  boardId: Id<'boards'>
) =>
  await ctx.db
    .query('boardTiers')
    .withIndex('byBoard', (q) => q.eq('boardId', boardId))
    .take(51)

const loadLargePublishCoverState = async (
  ctx: MutationCtx,
  boardId: Id<'boards'>
): Promise<{
  coverItems: Doc<'templates'>['coverItems']
}> =>
{
  const items = await ctx.db
    .query('boardItems')
    .withIndex('byBoardDeletedAtOrder', (q) =>
      q.eq('boardId', boardId).eq('deletedAt', null)
    )
    .take(MAX_STANDARD_CLOUD_BOARD_ITEMS)

  return {
    coverItems: items
      .filter(isMediaBackedBoardItem)
      .slice(0, MAX_TEMPLATE_COVER_ITEMS)
      .map(toTemplateCoverItem),
  }
}

export const queueLargeTemplatePublish = async (
  ctx: MutationCtx,
  args: {
    title: string
    description: string | null
    category: TemplateCategory
    tags: string[]
    visibility: Doc<'templates'>['visibility']
    coverMediaExternalId: string | null | undefined
    coverFraming: TemplateCoverFraming | null | undefined
    creditLine: string | null
  },
  userId: Id<'users'>,
  board: Doc<'boards'>
): Promise<MarketplaceTemplatePublishResult> =>
{
  const existingJob = await findActivePublishJobForBoard(ctx, board._id)
  if (existingJob)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: 'a publish job is already running for this board',
    })
  }

  const [serverTiers, coverState] = await Promise.all([
    loadBoardTiersForTemplate(ctx, board._id),
    loadLargePublishCoverState(ctx, board._id),
  ])
  const suggestedTiers = tiersFromBoardRows(serverTiers)
  validateTemplateTiers(suggestedTiers)
  const coverMediaAssetId = await resolveCoverMediaId(
    ctx,
    userId,
    args.coverMediaExternalId,
    null
  )
  const coverFraming = resolveCoverFraming(
    args.coverFraming,
    null,
    coverMediaAssetId
  )

  const now = Date.now()
  const slug = await allocateTemplateSlug(ctx)
  const templateState = buildTemplateStateFields(
    board.activeItemCount,
    args.visibility,
    'publishPending'
  )
  const templateFields = buildTemplateInsertFields({
    slug,
    authorId: userId,
    title: args.title,
    description: args.description,
    category: args.category,
    tags: args.tags,
    visibility: args.visibility,
    coverMediaAssetId,
    coverFraming,
    coverItems: coverState.coverItems,
    suggestedTiers,
    sourceBoardId: board._id,
    itemCount: board.activeItemCount,
    creditLine: args.creditLine,
    templateState,
    board,
    now,
  })
  const { templateId } = await insertTemplateWithStatsAndCard(
    ctx,
    templateFields,
    now
  )
  const jobId = await ctx.db.insert('templatePublishJobs', {
    ownerId: userId,
    sourceBoardId: board._id,
    targetTemplateId: templateId,
    status: 'queued',
    itemCount: board.activeItemCount,
    processedItemCount: 0,
    nextCursor: null,
    sourceBoardRevision: board.revision,
    errorCode: null,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    canceledAt: null,
  })
  await ctx.scheduler.runAfter(
    0,
    internal.marketplace.templates.internal.processTemplatePublishJob,
    { jobId }
  )
  return { status: 'jobQueued', slug, jobId }
}

export const queueLargeTemplateClone = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  template: Doc<'templates'>,
  title: string,
  tiers: readonly TierPresetTier[],
  preferredCriterionExternalId: string | undefined
): Promise<MarketplaceTemplateUseResult> =>
{
  const existingJob = await findActiveCloneJobForTemplate(
    ctx,
    userId,
    template._id
  )
  if (existingJob)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: 'a clone job is already running for this template',
    })
  }

  const boardExternalId = generateBoardId()
  const now = Date.now()
  const boardId = await ctx.db.insert('boards', {
    externalId: boardExternalId,
    ownerId: userId,
    preferredCriterionExternalId: preferredCriterionExternalId ?? null,
    ...buildForkedBoardInsert(template, {
      title,
      // false during the clone job's queued/running phase - flipped to true the
      // moment processTemplateCloneJob ticks the fork counter at job completion
      forkCounted: false,
      materializationState: 'clonePending',
      now,
    }),
  })
  await insertBoardTiers(ctx, boardId, tiers)

  const jobId = await ctx.db.insert('templateCloneJobs', {
    ownerId: userId,
    sourceTemplateId: template._id,
    targetBoardId: boardId,
    status: 'queued',
    itemCount: template.itemCount,
    processedItemCount: 0,
    nextCursor: null,
    errorCode: null,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    canceledAt: null,
  })
  await ctx.scheduler.runAfter(
    0,
    internal.marketplace.templates.internal.processTemplateCloneJob,
    { jobId }
  )
  return { status: 'jobQueued', boardExternalId, jobId }
}

type MutableTemplateJob = Doc<'templatePublishJobs'> | Doc<'templateCloneJobs'>

const retryTemplateJob = async <TJob extends MutableTemplateJob>(
  ctx: MutationCtx,
  userId: Id<'users'>,
  job: TJob | null,
  onQueued: (job: TJob, now: number) => Promise<void>
): Promise<null> =>
{
  if (!job || job.ownerId !== userId || job.status !== 'failed')
  {
    return null
  }

  const now = Date.now()
  await ctx.db.patch(job._id, {
    status: 'queued',
    errorCode: null,
    retryCount: job.retryCount + 1,
    startedAt: null,
    completedAt: null,
    canceledAt: null,
    updatedAt: now,
  })
  await onQueued(job, now)
  return null
}

const cancelTemplateJob = async <TJob extends MutableTemplateJob>(
  ctx: MutationCtx,
  userId: Id<'users'>,
  job: TJob | null,
  onCanceled: (job: TJob) => Promise<void>
): Promise<null> =>
{
  if (
    !job ||
    job.ownerId !== userId ||
    isFinishedTemplateJobStatus(job.status)
  )
  {
    return null
  }

  const now = Date.now()
  await ctx.db.patch(job._id, {
    status: 'canceled',
    errorCode: null,
    canceledAt: now,
    completedAt: now,
    updatedAt: now,
  })
  await onCanceled(job)
  return null
}

export const retryTemplatePublishJob = mutation({
  args: { jobId: v.id('templatePublishJobs') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const job = await ctx.db.get(args.jobId)
    return await retryTemplateJob(ctx, userId, job, async (queuedJob) =>
    {
      await ctx.scheduler.runAfter(
        0,
        internal.marketplace.templates.internal.processTemplatePublishJob,
        { jobId: queuedJob._id }
      )
    })
  },
})

export const cancelTemplatePublishJob = mutation({
  args: { jobId: v.id('templatePublishJobs') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const job = await ctx.db.get(args.jobId)
    return await cancelTemplateJob(ctx, userId, job, async (canceledJob) =>
    {
      await ctx.scheduler.runAfter(
        0,
        internal.marketplace.templates.internal.cascadeDeleteTemplate,
        {
          templateId: canceledJob.targetTemplateId,
          cursor: null,
          phase: 'items',
        }
      )
    })
  },
})

export const retryTemplateCloneJob = mutation({
  args: { jobId: v.id('templateCloneJobs') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const job = await ctx.db.get(args.jobId)
    return await retryTemplateJob(ctx, userId, job, async (queuedJob, now) =>
    {
      const board = await ctx.db.get(queuedJob.targetBoardId)
      if (board)
      {
        await ctx.db.patch(board._id, {
          materializationState: 'clonePending',
          updatedAt: now,
        })
      }
      await ctx.scheduler.runAfter(
        0,
        internal.marketplace.templates.internal.processTemplateCloneJob,
        { jobId: queuedJob._id }
      )
    })
  },
})

export const cancelTemplateCloneJob = mutation({
  args: { jobId: v.id('templateCloneJobs') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const userId = await requireCurrentUserId(ctx)
    const job = await ctx.db.get(args.jobId)
    return await cancelTemplateJob(ctx, userId, job, async (canceledJob) =>
    {
      await ctx.scheduler.runAfter(
        0,
        internal.workspace.boards.internal.cascadeDeleteBoard,
        { boardId: canceledJob.targetBoardId, cursor: null, phase: 'items' }
      )
    })
  },
})
