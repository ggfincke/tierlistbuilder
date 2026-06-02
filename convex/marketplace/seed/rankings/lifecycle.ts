// convex/marketplace/seed/rankings/lifecycle.ts
// release activation & rollback for seed-owned ranking rows

import { ConvexError, v } from 'convex/values'
import { internalMutation, type MutationCtx } from '../../../_generated/server'
import type { Doc, Id } from '../../../_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import type { SeedRankingReleaseStatus } from '@tierlistbuilder/contracts/marketplace/seedPipeline'
import { assertNonemptyString } from '../../../lib/assertions'
import { BATCH_LIMITS } from '../../../lib/limits'
import { assertSeedReleaseArgs } from '../lib/runRecords'
import { queueTemplateRankingAggregateRecomputesForRankings } from '../../rankings/aggregate/lib'
import {
  seedRankingActivationResultValidator,
  type SeedRankingActivationResult,
} from './validators'
import { hasFeaturedSlot, takeBoundedSeedRankings } from './rows'

const loadSeedRankingsForReleaseStatus = async (
  ctx: MutationCtx,
  datasetKey: string,
  releaseId: string,
  statuses: SeedRankingReleaseStatus | readonly SeedRankingReleaseStatus[]
): Promise<Doc<'publishedRankings'>[]> =>
{
  const statusList = Array.isArray(statuses) ? statuses : [statuses]
  const rows: Doc<'publishedRankings'>[] = []
  for (const status of statusList)
  {
    rows.push(
      ...(await ctx.db
        .query('publishedRankings')
        .withIndex('bySeedDatasetReleaseStatus', (q) =>
          q
            .eq('seedDatasetKey', datasetKey)
            .eq('seedReleaseId', releaseId)
            .eq('seedReleaseStatus', status)
        )
        .take(BATCH_LIMITS.rankingSeedLifecycleTransition))
    )
  }
  return rows
}

// Discover active ranking rows in any release except target.
// Template activation flips seedRuns before ranking activation runs.
const loadActiveSeedRankingsExcept = async (
  ctx: MutationCtx,
  datasetKey: string,
  exceptReleaseId: string
): Promise<Doc<'publishedRankings'>[]> =>
{
  const batch = BATCH_LIMITS.rankingSeedLifecycleTransition
  const [beforeTarget, afterTarget] = await Promise.all([
    ctx.db
      .query('publishedRankings')
      .withIndex('bySeedDatasetStatusReleaseId', (q) =>
        q
          .eq('seedDatasetKey', datasetKey)
          .eq('seedReleaseStatus', 'active')
          .gt('seedReleaseId', '')
          .lt('seedReleaseId', exceptReleaseId)
      )
      .take(batch),
    ctx.db
      .query('publishedRankings')
      .withIndex('bySeedDatasetStatusReleaseId', (q) =>
        q
          .eq('seedDatasetKey', datasetKey)
          .eq('seedReleaseStatus', 'active')
          .gt('seedReleaseId', exceptReleaseId)
      )
      .take(batch),
  ])
  return [...beforeTarget, ...afterTarget].slice(0, batch)
}

const ACTIVATABLE_TARGET_STATUSES: readonly SeedRankingReleaseStatus[] = [
  'applied_hidden',
  'rolled_back',
]

const patchSeedBoardStatuses = async (
  ctx: MutationCtx,
  boardIds: ReadonlySet<Id<'boards'>>,
  status: SeedRankingReleaseStatus,
  now: number
): Promise<void> =>
{
  await Promise.all(
    [...boardIds].map(async (boardId) =>
    {
      await ctx.db.patch(boardId, {
        seedReleaseStatus: status,
        updatedAt: now,
      })
    })
  )
}

export const activateSeedRankingReleaseInternal = async (
  ctx: MutationCtx,
  params: {
    datasetKey: string
    releaseId: string
    queueAggregates?: boolean
  }
): Promise<SeedRankingActivationResult> =>
{
  const now = Date.now()
  const [targetRows, activeTargetRows] = await Promise.all([
    loadSeedRankingsForReleaseStatus(
      ctx,
      params.datasetKey,
      params.releaseId,
      ACTIVATABLE_TARGET_STATUSES
    ),
    loadSeedRankingsForReleaseStatus(
      ctx,
      params.datasetKey,
      params.releaseId,
      'active'
    ),
  ])
  if (targetRows.length === 0 && activeTargetRows.length === 0)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: `seed ranking release has no active or activatable rows: ${params.releaseId}`,
    })
  }

  const rolledBackRows = await loadActiveSeedRankingsExcept(
    ctx,
    params.datasetKey,
    params.releaseId
  )
  const rolledBackBoardIds = new Set<Id<'boards'>>()
  for (const ranking of rolledBackRows)
  {
    if (ranking.sourceBoardId !== null)
    {
      rolledBackBoardIds.add(ranking.sourceBoardId)
    }
  }
  await Promise.all(
    rolledBackRows.map((ranking) =>
      ctx.db.patch(ranking._id, {
        publicationState: 'unpublished',
        isPubliclyListable: false,
        isFeatured: false,
        seedReleaseStatus: 'rolled_back',
        updatedAt: now,
      })
    )
  )
  await patchSeedBoardStatuses(ctx, rolledBackBoardIds, 'rolled_back', now)

  const activatedBoardIds = new Set<Id<'boards'>>()
  for (const ranking of targetRows)
  {
    if (ranking.sourceBoardId !== null)
    {
      activatedBoardIds.add(ranking.sourceBoardId)
    }
  }
  await Promise.all(
    targetRows.map((ranking) =>
    {
      return ctx.db.patch(ranking._id, {
        visibility: 'public',
        publicationState: 'published',
        isPubliclyListable: true,
        isFeatured: hasFeaturedSlot(ranking),
        seedReleaseStatus: 'active',
        updatedAt: now,
      })
    })
  )
  await patchSeedBoardStatuses(ctx, activatedBoardIds, 'active', now)

  const aggregateJobsQueued =
    params.queueAggregates === false
      ? 0
      : await queueTemplateRankingAggregateRecomputesForRankings(
          ctx,
          [...rolledBackRows, ...targetRows],
          now
        )

  return {
    datasetKey: params.datasetKey,
    releaseId: params.releaseId,
    activatedRankings: targetRows.length,
    rolledBackRankings: rolledBackRows.length,
    aggregateJobsQueued,
  }
}

export const activateSeedRankings = internalMutation({
  args: {
    datasetKey: v.string(),
    releaseId: v.string(),
    queueAggregates: v.optional(v.boolean()),
  },
  returns: seedRankingActivationResultValidator,
  handler: async (ctx, args): Promise<SeedRankingActivationResult> =>
  {
    assertSeedReleaseArgs(args)
    return await activateSeedRankingReleaseInternal(ctx, {
      datasetKey: args.datasetKey,
      releaseId: args.releaseId,
      queueAggregates: args.queueAggregates,
    })
  },
})

// Rollback makes target release the sole active one.
// Caller intends replacement rather than promotion.
export const rollbackSeedRankings = internalMutation({
  args: {
    datasetKey: v.string(),
    targetReleaseId: v.string(),
    queueAggregates: v.optional(v.boolean()),
  },
  returns: seedRankingActivationResultValidator,
  handler: async (ctx, args): Promise<SeedRankingActivationResult> =>
  {
    assertNonemptyString('datasetKey', args.datasetKey)
    assertNonemptyString('targetReleaseId', args.targetReleaseId)
    return await activateSeedRankingReleaseInternal(ctx, {
      datasetKey: args.datasetKey,
      releaseId: args.targetReleaseId,
      queueAggregates: args.queueAggregates,
    })
  },
})

export const queueActiveSeedRankingAggregates = internalMutation({
  args: {
    datasetKey: v.string(),
    releaseId: v.string(),
  },
  returns: seedRankingActivationResultValidator,
  handler: async (ctx, args): Promise<SeedRankingActivationResult> =>
  {
    assertSeedReleaseArgs(args)
    const rows = await takeBoundedSeedRankings(ctx, {
      datasetKey: args.datasetKey,
      releaseId: args.releaseId,
      status: 'active',
      overLimitMessage: `seed ranking release exceeds aggregate queue limit: ${args.releaseId}`,
    })
    const aggregateJobsQueued =
      await queueTemplateRankingAggregateRecomputesForRankings(
        ctx,
        rows,
        Date.now()
      )
    return {
      datasetKey: args.datasetKey,
      releaseId: args.releaseId,
      activatedRankings: 0,
      rolledBackRankings: 0,
      aggregateJobsQueued,
    }
  },
})
