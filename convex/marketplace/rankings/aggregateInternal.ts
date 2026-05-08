// convex/marketplace/rankings/aggregateInternal.ts
// internal scheduled recompute jobs for template-ranking consensus

import { v } from 'convex/values'
import { internalMutation, type MutationCtx } from '../../_generated/server'
import { internal } from '../../_generated/api'
import type { Doc, Id } from '../../_generated/dataModel'
import { BATCH_LIMITS, MAX_SYNC_TIERS } from '../../lib/limits'
import { isPublicRankingRow } from './lib'
import {
  buildAggregateItemMetrics,
  deleteTemplateRankingAggregateParentRows,
  findTemplateRankingAggregate,
  makeEmptyDistribution,
  queueTemplateRankingAggregateRecompute,
} from './aggregate'
import { buildRankingTierBucketMap } from '@tierlistbuilder/contracts/marketplace/ranking'
import { makeEmptyBucketSpread } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'

type AggregateJob = Doc<'templateRankingAggregateJobs'>
type AggregateScheduleState = 'stale' | 'computing'
type AggregateRetryStatus = 'queued' | 'running'

interface BucketSpreadDelta
{
  previous: number | null
  next: number | null
}

const AGGREGATE_JOB_MAX_RETRIES = 3
const AGGREGATE_JOB_RETRY_AFTER_MS = 30 * 60 * 1000

const aggregateScheduleStateValidator = v.union(
  v.literal('stale'),
  v.literal('computing')
)

const aggregateRetryStatusValidator = v.union(
  v.literal('queued'),
  v.literal('running')
)

const aggregateItemSearchText = (item: Doc<'templateItems'>): string =>
  [item.label, item.externalId].filter(Boolean).join(' ').toLowerCase()

const scheduleJob = async (
  ctx: MutationCtx,
  jobId: Id<'templateRankingAggregateJobs'>
): Promise<void> =>
{
  await ctx.scheduler.runAfter(
    0,
    internal.marketplace.rankings.aggregateInternal
      .processTemplateRankingAggregateJob,
    { jobId }
  )
}

const scheduleGenerationCleanup = async (
  ctx: MutationCtx,
  templateId: Id<'templates'>,
  generation: number
): Promise<void> =>
{
  await ctx.scheduler.runAfter(
    0,
    internal.marketplace.rankings.aggregateInternal
      .deleteTemplateRankingAggregateGeneration,
    { templateId, generation, cursor: null }
  )
}

const isLatestPublicRankingForOwner = async (
  ctx: MutationCtx,
  ranking: Doc<'publishedRankings'>
): Promise<boolean> =>
{
  const latest = await ctx.db
    .query('publishedRankings')
    .withIndex('bySourceTemplateOwnerPublicCreatedAt', (q) =>
      q
        .eq('sourceTemplateId', ranking.sourceTemplateId)
        .eq('ownerId', ranking.ownerId)
        .eq('isPubliclyListable', true)
    )
    .order('desc')
    .take(1)
  return latest[0]?._id === ranking._id && isPublicRankingRow(ranking)
}

const seedAggregateItemRows = async (
  ctx: MutationCtx,
  job: AggregateJob,
  now: number
): Promise<null> =>
{
  const page = await ctx.db
    .query('templateItems')
    .withIndex('byTemplate', (q) => q.eq('templateId', job.templateId))
    .paginate({
      numItems: BATCH_LIMITS.templateRankingAggregateSeedItems,
      cursor: job.templateCursor,
    })

  await Promise.all(
    page.page.map((item) =>
      ctx.db.insert('templateRankingAggregateItems', {
        templateId: job.templateId,
        generation: job.generation,
        templateItemId: item._id,
        templateItemExternalId: item.externalId,
        label: item.label,
        backgroundColor: item.backgroundColor,
        altText: item.altText,
        mediaAssetId: item.mediaAssetId,
        order: item.order,
        aspectRatio: item.aspectRatio,
        imageFit: item.imageFit,
        transform: item.transform,
        sampleCount: 0,
        bucketWeightSum: 0,
        bucketSquareSum: 0,
        averageBucket: null,
        topBucketIndex: null,
        topBucketShare: 0,
        consensusScore: 0,
        controversyScore: 0,
        averageTopSort: job.bucketCount + 1,
        averageBottomSort: job.bucketCount + 1,
        consensusSort: job.bucketCount + 1,
        controversySort: job.bucketCount + 1,
        isTopBucket: false,
        isBottomBucket: false,
        isControversial: false,
        searchText: aggregateItemSearchText(item),
        distribution: makeEmptyDistribution(job.bucketCount),
        computedAt: now,
      })
    )
  )

  const itemCount = job.itemCount + page.page.length
  if (!page.isDone)
  {
    await ctx.db.patch(job._id, {
      status: 'running',
      itemCount,
      templateCursor: page.continueCursor,
      updatedAt: now,
    })
    await scheduleJob(ctx, job._id)
    return null
  }

  await ctx.db.patch(job._id, {
    status: 'running',
    phase: 'scanRankings',
    itemCount,
    templateCursor: null,
    bucketSpread: makeEmptyBucketSpread(job.bucketCount),
    updatedAt: now,
  })
  await scheduleJob(ctx, job._id)
  return null
}

const tierBucketMap = (
  tiers: readonly Doc<'publishedRankingTiers'>[],
  bucketCount: number,
  targetBucketLabels: readonly string[] | undefined
): Map<string, number> =>
  buildRankingTierBucketMap(tiers, bucketCount, targetBucketLabels)

const loadTierBucketMap = async (
  ctx: MutationCtx,
  rankingId: Id<'publishedRankings'>,
  bucketCount: number,
  targetBucketLabels: readonly string[] | undefined
): Promise<Map<string, number>> =>
{
  const tiers = await ctx.db
    .query('publishedRankingTiers')
    .withIndex('byRanking', (q) => q.eq('rankingId', rankingId))
    .take(MAX_SYNC_TIERS)
  return tierBucketMap(tiers, bucketCount, targetBucketLabels)
}

const applyBucketSpreadDelta = (
  spread: number[],
  delta: BucketSpreadDelta | null
): void =>
{
  if (!delta || delta.previous === delta.next) return
  if (delta.previous !== null)
  {
    spread[delta.previous] = Math.max(0, (spread[delta.previous] ?? 0) - 1)
  }
  if (delta.next !== null)
  {
    spread[delta.next] = (spread[delta.next] ?? 0) + 1
  }
}

const incrementAggregateItem = async (
  ctx: MutationCtx,
  job: AggregateJob,
  item: Doc<'publishedRankingItems'>,
  bucketIndex: number,
  now: number
): Promise<BucketSpreadDelta | null> =>
{
  const row = await ctx.db
    .query('templateRankingAggregateItems')
    .withIndex('byTemplateIdAndGenerationAndTemplateItemId', (q) =>
      q
        .eq('templateId', job.templateId)
        .eq('generation', job.generation)
        .eq('templateItemId', item.templateItemId)
    )
    .unique()
  if (!row) return null

  const distribution = row.distribution.map((cell) =>
    cell.bucketIndex === bucketIndex ? { ...cell, count: cell.count + 1 } : cell
  )
  const sampleCount = row.sampleCount + 1
  const bucketWeightSum = row.bucketWeightSum + bucketIndex
  const bucketSquareSum = row.bucketSquareSum + bucketIndex ** 2
  const metrics = buildAggregateItemMetrics({
    distribution,
    sampleCount,
    bucketWeightSum,
    bucketSquareSum,
    bucketCount: job.bucketCount,
  })

  await ctx.db.patch(row._id, {
    sampleCount,
    bucketWeightSum,
    bucketSquareSum,
    distribution,
    ...metrics,
    computedAt: now,
  })
  return {
    previous: row.topBucketIndex,
    next: metrics.topBucketIndex,
  }
}

const processActiveRanking = async (
  ctx: MutationCtx,
  job: AggregateJob,
  now: number
): Promise<null> =>
{
  const rankingId = job.activeRankingId
  if (rankingId === null) return null

  const ranking = await ctx.db.get(rankingId)
  if (
    !ranking ||
    ranking.sourceTemplateId !== job.templateId ||
    !isPublicRankingRow(ranking)
  )
  {
    await ctx.db.patch(job._id, {
      activeRankingId: null,
      activeRankingItemCursor: null,
      updatedAt: now,
    })
    await scheduleJob(ctx, job._id)
    return null
  }

  const buckets = await loadTierBucketMap(
    ctx,
    ranking._id,
    job.bucketCount,
    job.targetBucketLabels
  )
  const page = await ctx.db
    .query('publishedRankingItems')
    .withIndex('byRanking', (q) => q.eq('rankingId', ranking._id))
    .paginate({
      numItems: BATCH_LIMITS.templateRankingAggregateRankingItems,
      cursor: job.activeRankingItemCursor,
    })

  const bucketSpread = [...job.bucketSpread]
  const deltas = await Promise.all(
    page.page.map(async (item) =>
    {
      const tierExternalId = item.tierExternalId
      if (tierExternalId === null) return null

      const bucketIndex = buckets.get(tierExternalId)
      if (bucketIndex === undefined) return null

      return await incrementAggregateItem(ctx, job, item, bucketIndex, now)
    })
  )
  deltas.forEach((delta) => applyBucketSpreadDelta(bucketSpread, delta))

  if (!page.isDone)
  {
    await ctx.db.patch(job._id, {
      activeRankingItemCursor: page.continueCursor,
      bucketSpread,
      updatedAt: now,
    })
    await scheduleJob(ctx, job._id)
    return null
  }

  const rankingCount = job.rankingCount + 1
  await ctx.db.patch(job._id, {
    rankingCount,
    activeRankingId: null,
    activeRankingItemCursor: null,
    bucketSpread,
    updatedAt: now,
  })
  if (job.rankingScanDone)
  {
    await finishJob(ctx, { ...job, rankingCount, bucketSpread }, now)
    return null
  }

  await scheduleJob(ctx, job._id)
  return null
}

const selectNextRanking = async (
  ctx: MutationCtx,
  job: AggregateJob,
  now: number
): Promise<null> =>
{
  if (job.rankingScanDone)
  {
    await finishJob(ctx, job, now)
    return null
  }

  const page = await ctx.db
    .query('publishedRankings')
    .withIndex('bySourceTemplatePublicCreatedAt', (q) =>
      q.eq('sourceTemplateId', job.templateId).eq('isPubliclyListable', true)
    )
    .order('desc')
    .paginate({
      numItems: 1,
      cursor: job.rankingCursor,
    })
  const ranking = page.page[0]
  if (!ranking)
  {
    await finishJob(ctx, job, now)
    return null
  }

  const isLatest = await isLatestPublicRankingForOwner(ctx, ranking)
  await ctx.db.patch(job._id, {
    rankingCursor: page.continueCursor,
    rankingScanDone: page.isDone,
    publicRankingCount: job.publicRankingCount + 1,
    activeRankingId: isLatest ? ranking._id : null,
    activeRankingItemCursor: null,
    updatedAt: now,
  })
  await scheduleJob(ctx, job._id)
  return null
}

async function finishJob(
  ctx: MutationCtx,
  job: AggregateJob,
  now: number
): Promise<void>
{
  const aggregate = await findTemplateRankingAggregate(ctx, job.templateId)
  const previousGeneration = aggregate?.activeGeneration ?? null
  const bucketSpread = job.bucketSpread
  if (aggregate)
  {
    await ctx.db.patch(aggregate._id, {
      state: job.rankingCount > 0 ? 'ready' : 'empty',
      activeGeneration: job.generation,
      bucketCount: job.bucketCount,
      rankingCount: job.rankingCount,
      itemCount: job.itemCount,
      computedAt: now,
      staleAt: null,
      bucketSpread,
      updatedAt: now,
    })
  }
  else
  {
    await ctx.db.insert('templateRankingAggregates', {
      templateId: job.templateId,
      state: job.rankingCount > 0 ? 'ready' : 'empty',
      activeGeneration: job.generation,
      bucketCount: job.bucketCount,
      rankingCount: job.rankingCount,
      itemCount: job.itemCount,
      computedAt: now,
      staleAt: null,
      bucketSpread,
      updatedAt: now,
    })
  }

  await ctx.db.delete(job._id)
  if (previousGeneration !== null && previousGeneration !== job.generation)
  {
    await scheduleGenerationCleanup(ctx, job.templateId, previousGeneration)
  }
  if (
    job.restartRequestedAt !== null &&
    job.restartRequestedAt > job.createdAt
  )
  {
    await queueTemplateRankingAggregateRecompute(ctx, job.templateId, now)
  }
}

const markAggregateJobFailed = async (
  ctx: MutationCtx,
  job: AggregateJob,
  now: number,
  lastError: string
): Promise<void> =>
{
  await ctx.db.patch(job._id, {
    status: 'failed',
    lastError,
    failedAt: now,
    updatedAt: now,
  })

  const aggregate = await findTemplateRankingAggregate(ctx, job.templateId)
  if (aggregate?.activeGeneration === null)
  {
    await ctx.db.patch(aggregate._id, {
      state: 'failed',
      staleAt: now,
      updatedAt: now,
    })
  }
}

const retryOrFailStaleAggregateJob = async (
  ctx: MutationCtx,
  job: AggregateJob,
  now: number
): Promise<'retry' | 'failed'> =>
{
  if (job.retryCount >= AGGREGATE_JOB_MAX_RETRIES)
  {
    await markAggregateJobFailed(ctx, job, now, 'stale_job_timeout')
    return 'failed'
  }

  await ctx.db.patch(job._id, {
    status: 'queued',
    retryCount: job.retryCount + 1,
    lastError: 'stale_job_timeout',
    failedAt: null,
    updatedAt: now,
  })
  await scheduleJob(ctx, job._id)
  return 'retry'
}

export const processTemplateRankingAggregateJob = internalMutation({
  args: { jobId: v.id('templateRankingAggregateJobs') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const job = await ctx.db.get(args.jobId)
    if (!job) return null
    if (job.status !== 'queued' && job.status !== 'running') return null

    const template = await ctx.db.get(job.templateId)
    if (!template)
    {
      await ctx.db.delete(job._id)
      return null
    }

    const now = Date.now()
    if (job.phase === 'seedItems')
    {
      return await seedAggregateItemRows(ctx, job, now)
    }
    if (job.activeRankingId !== null)
    {
      return await processActiveRanking(ctx, job, now)
    }
    return await selectNextRanking(ctx, job, now)
  },
})

export const queueTemplateRankingAggregateRecomputeForTemplate =
  internalMutation({
    args: { templateId: v.id('templates') },
    returns: v.null(),
    handler: async (ctx, args): Promise<null> =>
    {
      await queueTemplateRankingAggregateRecompute(
        ctx,
        args.templateId,
        Date.now()
      )
      return null
    },
  })

export const deleteTemplateRankingAggregateGeneration = internalMutation({
  args: {
    templateId: v.id('templates'),
    generation: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const page = await ctx.db
      .query('templateRankingAggregateItems')
      .withIndex('byTemplateIdAndGenerationAndOrder', (q) =>
        q.eq('templateId', args.templateId).eq('generation', args.generation)
      )
      .paginate({
        numItems: BATCH_LIMITS.templateRankingAggregateCleanup,
        cursor: args.cursor,
      })

    await Promise.all(page.page.map((row) => ctx.db.delete(row._id)))
    if (!page.isDone)
    {
      await ctx.scheduler.runAfter(
        0,
        internal.marketplace.rankings.aggregateInternal
          .deleteTemplateRankingAggregateGeneration,
        {
          templateId: args.templateId,
          generation: args.generation,
          cursor: page.continueCursor,
        }
      )
    }
    return null
  },
})

export const retryStaleTemplateRankingAggregateJobs = internalMutation({
  args: {
    status: v.optional(aggregateRetryStatusValidator),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.object({ scheduled: v.number(), isDone: v.boolean() }),
  handler: async (
    ctx,
    args
  ): Promise<{ scheduled: number; isDone: boolean }> =>
  {
    const status: AggregateRetryStatus = args.status ?? 'queued'
    const now = Date.now()
    const cutoff = now - AGGREGATE_JOB_RETRY_AFTER_MS
    const page = await ctx.db
      .query('templateRankingAggregateJobs')
      .withIndex('byStatusAndUpdatedAt', (q) =>
        q.eq('status', status).lt('updatedAt', cutoff)
      )
      .paginate({
        numItems: BATCH_LIMITS.templateRankingAggregateSchedule,
        cursor: args.cursor,
      })

    let scheduled = 0
    await Promise.all(
      page.page.map(async (job) =>
      {
        const result = await retryOrFailStaleAggregateJob(ctx, job, now)
        if (result === 'retry') scheduled++
      })
    )

    if (!page.isDone)
    {
      await ctx.scheduler.runAfter(
        0,
        internal.marketplace.rankings.aggregateInternal
          .retryStaleTemplateRankingAggregateJobs,
        { status, cursor: page.continueCursor }
      )
    }
    else if (status === 'queued')
    {
      await ctx.scheduler.runAfter(
        0,
        internal.marketplace.rankings.aggregateInternal
          .retryStaleTemplateRankingAggregateJobs,
        { status: 'running', cursor: null }
      )
    }

    return { scheduled, isDone: page.isDone && status === 'running' }
  },
})

export const scheduleTemplateRankingAggregateRecomputes = internalMutation({
  args: {
    state: v.optional(aggregateScheduleStateValidator),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.object({ scheduled: v.number(), isDone: v.boolean() }),
  handler: async (
    ctx,
    args
  ): Promise<{ scheduled: number; isDone: boolean }> =>
  {
    const state: AggregateScheduleState = args.state ?? 'stale'
    const page = await ctx.db
      .query('templateRankingAggregates')
      .withIndex('byStateAndUpdatedAt', (q) => q.eq('state', state))
      .paginate({
        numItems: BATCH_LIMITS.templateRankingAggregateSchedule,
        cursor: args.cursor,
      })

    const now = Date.now()
    let scheduled = 0
    for (const aggregate of page.page)
    {
      const template = await ctx.db.get(aggregate.templateId)
      if (!template?.isPubliclyListable)
      {
        continue
      }
      await queueTemplateRankingAggregateRecompute(
        ctx,
        aggregate.templateId,
        now
      )
      scheduled++
    }

    if (!page.isDone)
    {
      await ctx.scheduler.runAfter(
        0,
        internal.marketplace.rankings.aggregateInternal
          .scheduleTemplateRankingAggregateRecomputes,
        { state, cursor: page.continueCursor }
      )
    }
    else if (state === 'stale')
    {
      await ctx.scheduler.runAfter(
        0,
        internal.marketplace.rankings.aggregateInternal
          .scheduleTemplateRankingAggregateRecomputes,
        { state: 'computing', cursor: null }
      )
    }

    return { scheduled, isDone: page.isDone && state === 'computing' }
  },
})

export const deleteTemplateRankingAggregateRows = internalMutation({
  args: {
    templateId: v.id('templates'),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.object({ isDone: v.boolean() }),
  handler: async (ctx, args): Promise<{ isDone: boolean }> =>
  {
    const page = await ctx.db
      .query('templateRankingAggregateItems')
      .withIndex('byTemplateIdAndOrder', (q) =>
        q.eq('templateId', args.templateId)
      )
      .paginate({
        numItems: BATCH_LIMITS.templateRankingAggregateCleanup,
        cursor: args.cursor,
      })

    await Promise.all(page.page.map((row) => ctx.db.delete(row._id)))
    if (page.isDone)
    {
      await deleteTemplateRankingAggregateParentRows(ctx, args.templateId)
    }
    return { isDone: page.isDone }
  },
})
