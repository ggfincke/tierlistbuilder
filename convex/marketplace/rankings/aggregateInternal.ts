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

type AggregateJob = Doc<'templateRankingAggregateJobs'>

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
        order: item.order,
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
    updatedAt: now,
  })
  await scheduleJob(ctx, job._id)
  return null
}

const tierBucketMap = (
  tiers: readonly Doc<'publishedRankingTiers'>[],
  bucketCount: number
): Map<string, number> =>
{
  const map = new Map<string, number>()
  tiers
    .slice()
    .sort((a, b) => a.order - b.order)
    .forEach((tier, index) =>
      map.set(tier.externalId, Math.min(index, bucketCount - 1))
    )
  return map
}

const loadTierBucketMap = async (
  ctx: MutationCtx,
  rankingId: Id<'publishedRankings'>,
  bucketCount: number
): Promise<Map<string, number>> =>
{
  const tiers = await ctx.db
    .query('publishedRankingTiers')
    .withIndex('byRanking', (q) => q.eq('rankingId', rankingId))
    .take(MAX_SYNC_TIERS)
  return tierBucketMap(tiers, bucketCount)
}

const incrementAggregateItem = async (
  ctx: MutationCtx,
  job: AggregateJob,
  item: Doc<'publishedRankingItems'>,
  bucketIndex: number,
  now: number
): Promise<void> =>
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
  if (!row) return

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
  if (!ranking || !(await isLatestPublicRankingForOwner(ctx, ranking)))
  {
    await ctx.db.patch(job._id, {
      activeRankingId: null,
      activeRankingItemCursor: null,
      updatedAt: now,
    })
    await scheduleJob(ctx, job._id)
    return null
  }

  const buckets = await loadTierBucketMap(ctx, ranking._id, job.bucketCount)
  const page = await ctx.db
    .query('publishedRankingItems')
    .withIndex('byRanking', (q) => q.eq('rankingId', ranking._id))
    .paginate({
      numItems: BATCH_LIMITS.templateRankingAggregateRankingItems,
      cursor: job.activeRankingItemCursor,
    })

  await Promise.all(
    page.page.map(async (item) =>
    {
      const tierExternalId = item.tierExternalId
      if (tierExternalId === null) return

      const bucketIndex = buckets.get(tierExternalId)
      if (bucketIndex === undefined) return

      await incrementAggregateItem(ctx, job, item, bucketIndex, now)
    })
  )

  if (!page.isDone)
  {
    await ctx.db.patch(job._id, {
      activeRankingItemCursor: page.continueCursor,
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
    updatedAt: now,
  })
  if (job.rankingScanDone)
  {
    await finishJob(ctx, { ...job, rankingCount }, now)
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

export const scheduleTemplateRankingAggregateRecomputes = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({ scheduled: v.number(), isDone: v.boolean() }),
  handler: async (
    ctx,
    args
  ): Promise<{ scheduled: number; isDone: boolean }> =>
  {
    const page = await ctx.db
      .query('templateCards')
      .withIndex('byIsPubliclyListableUpdatedAt', (q) =>
        q.eq('isPubliclyListable', true)
      )
      .paginate({
        numItems: BATCH_LIMITS.templateRankingAggregateSchedule,
        cursor: args.cursor,
      })

    const now = Date.now()
    let scheduled = 0
    for (const card of page.page)
    {
      const aggregate = await findTemplateRankingAggregate(ctx, card.templateId)
      if (
        !aggregate ||
        aggregate.state === 'stale' ||
        aggregate.activeGeneration === null
      )
      {
        await queueTemplateRankingAggregateRecompute(ctx, card.templateId, now)
        scheduled++
      }
    }

    if (!page.isDone)
    {
      await ctx.scheduler.runAfter(
        0,
        internal.marketplace.rankings.aggregateInternal
          .scheduleTemplateRankingAggregateRecomputes,
        { cursor: page.continueCursor }
      )
    }

    return { scheduled, isDone: page.isDone }
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
