// convex/marketplace/rankings/aggregateInternal.ts
// compatibility shims for scheduled jobs queued before the rankings path split

import { v } from 'convex/values'
import { internalMutation } from '../../_generated/server'
import { internal } from '../../_generated/api'

const aggregateScheduleStateValidator = v.union(
  v.literal('stale'),
  v.literal('computing')
)

const aggregateRetryStatusValidator = v.union(
  v.literal('queued'),
  v.literal('running')
)

export const admitQueuedTemplateRankingAggregateJobs = internalMutation({
  args: {},
  returns: v.object({
    admitted: v.number(),
    running: v.number(),
    queuedRemaining: v.number(),
  }),
  handler: async (
    ctx
  ): Promise<{
    admitted: number
    running: number
    queuedRemaining: number
  }> =>
    await ctx.runMutation(
      internal.marketplace.rankings.aggregate.jobs
        .admitQueuedTemplateRankingAggregateJobs,
      {}
    ),
})

export const processTemplateRankingAggregateJob = internalMutation({
  args: { jobId: v.id('templateRankingAggregateJobs') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
    await ctx.runMutation(
      internal.marketplace.rankings.aggregate.jobs
        .processTemplateRankingAggregateJob,
      args
    ),
})

export const queueTemplateRankingAggregateRecomputeForTemplate =
  internalMutation({
    args: { templateId: v.id('templates') },
    returns: v.null(),
    handler: async (ctx, args): Promise<null> =>
      await ctx.runMutation(
        internal.marketplace.rankings.aggregate.jobs
          .queueTemplateRankingAggregateRecomputeForTemplate,
        args
      ),
  })

export const queueTemplateRankingAggregateRecomputeForCriterion =
  internalMutation({
    args: {
      templateId: v.id('templates'),
      criterionExternalId: v.string(),
    },
    returns: v.null(),
    handler: async (ctx, args): Promise<null> =>
      await ctx.runMutation(
        internal.marketplace.rankings.aggregate.jobs
          .queueTemplateRankingAggregateRecomputeForCriterion,
        args
      ),
  })

export const deleteTemplateRankingAggregateGeneration = internalMutation({
  args: {
    templateId: v.id('templates'),
    criterionExternalId: v.string(),
    generation: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
    await ctx.runMutation(
      internal.marketplace.rankings.aggregate.jobs
        .deleteTemplateRankingAggregateGeneration,
      args
    ),
})

export const retryStaleTemplateRankingAggregateJobs = internalMutation({
  args: {
    status: v.optional(aggregateRetryStatusValidator),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.object({ scheduled: v.number(), isDone: v.boolean() }),
  handler: async (ctx, args): Promise<{ scheduled: number; isDone: boolean }> =>
    await ctx.runMutation(
      internal.marketplace.rankings.aggregate.jobs
        .retryStaleTemplateRankingAggregateJobs,
      args
    ),
})

export const scheduleTemplateRankingAggregateRecomputes = internalMutation({
  args: {
    state: v.optional(aggregateScheduleStateValidator),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.object({ scheduled: v.number(), isDone: v.boolean() }),
  handler: async (ctx, args): Promise<{ scheduled: number; isDone: boolean }> =>
    await ctx.runMutation(
      internal.marketplace.rankings.aggregate.jobs
        .scheduleTemplateRankingAggregateRecomputes,
      args
    ),
})

export const deleteTemplateRankingAggregateRows = internalMutation({
  args: {
    templateId: v.id('templates'),
    criterionExternalId: v.optional(v.string()),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.object({ isDone: v.boolean() }),
  handler: async (ctx, args): Promise<{ isDone: boolean }> =>
    await ctx.runMutation(
      internal.marketplace.rankings.aggregate.jobs
        .deleteTemplateRankingAggregateRows,
      args
    ),
})

export const deleteTemplateRankingAggregateParentRowBatch = internalMutation({
  args: {
    templateId: v.id('templates'),
    criterionExternalId: v.optional(v.string()),
    phase: v.union(v.literal('aggregates'), v.literal('jobs')),
    cursor: v.union(v.string(), v.null()),
    rollupOnComplete: v.boolean(),
  },
  returns: v.object({ isDone: v.boolean() }),
  handler: async (ctx, args): Promise<{ isDone: boolean }> =>
    await ctx.runMutation(
      internal.marketplace.rankings.aggregate.jobs
        .deleteTemplateRankingAggregateParentRowBatch,
      args
    ),
})
