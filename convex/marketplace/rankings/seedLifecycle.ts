// convex/marketplace/rankings/seedLifecycle.ts
// release activation & rollback for seed-owned ranking rows

import { ConvexError, v } from 'convex/values'
import { internalMutation, type MutationCtx } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { assertNonemptyString } from '../../lib/assertions'
import { BATCH_LIMITS, SEED_LIMITS } from '../../lib/limits'
import {
  queueTemplateRankingAggregateRecompute,
  scheduleTemplateRankingAggregateJobAdmission,
} from './aggregate'
import {
  seedRankingActivationResultValidator,
  type SeedRankingActivationResult,
} from './seedValidators'

type SeedRankingReleaseStatus = NonNullable<
  Doc<'publishedRankings'>['seedReleaseStatus']
>

const loadSeedRankingsForReleaseStatus = async (
  ctx: MutationCtx,
  datasetKey: string,
  releaseId: string,
  status: SeedRankingReleaseStatus
): Promise<Doc<'publishedRankings'>[]> =>
{
  const rows = await ctx.db
    .query('publishedRankings')
    .withIndex('bySeedDatasetReleaseStatus', (q) =>
      q
        .eq('seedDatasetKey', datasetKey)
        .eq('seedReleaseId', releaseId)
        .eq('seedReleaseStatus', status)
    )
    .take(BATCH_LIMITS.rankingSeedLifecycleTransition)
  return rows
}

// discover ranking rows currently marked active in any release other than
// the target. independent of seedRuns state — template activation flips
// seedRuns to rolled_back BEFORE ranking activation runs
const loadActiveSeedRankingsExcept = async (
  ctx: MutationCtx,
  datasetKey: string,
  exceptReleaseId: string
): Promise<Doc<'publishedRankings'>[]> =>
{
  const batch = BATCH_LIMITS.rankingSeedLifecycleTransition
  const beforeTarget = await ctx.db
    .query('publishedRankings')
    .withIndex('bySeedDatasetStatusReleaseId', (q) =>
      q
        .eq('seedDatasetKey', datasetKey)
        .eq('seedReleaseStatus', 'active')
        .gt('seedReleaseId', '')
        .lt('seedReleaseId', exceptReleaseId)
    )
    .take(batch)
  if (beforeTarget.length >= batch)
  {
    return beforeTarget
  }
  const afterTarget = await ctx.db
    .query('publishedRankings')
    .withIndex('bySeedDatasetStatusReleaseId', (q) =>
      q
        .eq('seedDatasetKey', datasetKey)
        .eq('seedReleaseStatus', 'active')
        .gt('seedReleaseId', exceptReleaseId)
    )
    .take(batch - beforeTarget.length)
  return [...beforeTarget, ...afterTarget]
}

const loadSeedRankingsForAggregateQueue = async (
  ctx: MutationCtx,
  datasetKey: string,
  releaseId: string
): Promise<Doc<'publishedRankings'>[]> =>
{
  const rows = await ctx.db
    .query('publishedRankings')
    .withIndex('bySeedDatasetReleaseStatus', (q) =>
      q
        .eq('seedDatasetKey', datasetKey)
        .eq('seedReleaseId', releaseId)
        .eq('seedReleaseStatus', 'active')
    )
    .take(SEED_LIMITS.rankingSeedRowsPerRelease + 1)
  if (rows.length <= SEED_LIMITS.rankingSeedRowsPerRelease) return rows
  throw new ConvexError({
    code: CONVEX_ERROR_CODES.invalidState,
    message: `seed ranking release exceeds aggregate queue limit: ${releaseId}`,
  })
}

const ACTIVATABLE_TARGET_STATUSES: readonly SeedRankingReleaseStatus[] = [
  'applied_hidden',
  'rolled_back',
]

const loadSeedRankingsForActivatableRelease = async (
  ctx: MutationCtx,
  datasetKey: string,
  releaseId: string
): Promise<Doc<'publishedRankings'>[]> =>
{
  const rows: Doc<'publishedRankings'>[] = []
  for (const status of ACTIVATABLE_TARGET_STATUSES)
  {
    rows.push(
      ...(await loadSeedRankingsForReleaseStatus(
        ctx,
        datasetKey,
        releaseId,
        status
      ))
    )
  }
  return rows
}

const patchSeedBoardStatuses = async (
  ctx: MutationCtx,
  boardIds: ReadonlySet<Id<'boards'>>,
  status: SeedRankingReleaseStatus,
  now: number
): Promise<void> =>
{
  await Promise.all(
    Array.from(boardIds, async (boardId) =>
    {
      await ctx.db.patch(boardId, {
        seedReleaseStatus: status,
        updatedAt: now,
      })
    })
  )
}

const laneKey = (ranking: Doc<'publishedRankings'>): string =>
  `${ranking.sourceTemplateId}:${ranking.sourceCriterionExternalId}`

const queueTouchedAggregates = async (
  ctx: MutationCtx,
  rankings: readonly Doc<'publishedRankings'>[],
  now: number
): Promise<number> =>
{
  const queued = new Set<string>()
  for (const ranking of rankings)
  {
    const key = laneKey(ranking)
    if (queued.has(key)) continue
    queued.add(key)
    await queueTemplateRankingAggregateRecompute(
      ctx,
      ranking.sourceTemplateId,
      ranking.sourceCriterionExternalId,
      now,
      { scheduleAdmission: false }
    )
  }
  if (queued.size > 0)
  {
    await scheduleTemplateRankingAggregateJobAdmission(ctx)
  }
  return queued.size
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
    await ctx.db.patch(ranking._id, {
      publicationState: 'unpublished',
      isPubliclyListable: false,
      isFeatured: false,
      seedReleaseStatus: 'rolled_back',
      updatedAt: now,
    })
  }
  await patchSeedBoardStatuses(ctx, rolledBackBoardIds, 'rolled_back', now)

  const targetRows = await loadSeedRankingsForActivatableRelease(
    ctx,
    params.datasetKey,
    params.releaseId
  )
  const activatedBoardIds = new Set<Id<'boards'>>()
  for (const ranking of targetRows)
  {
    if (ranking.sourceBoardId !== null)
    {
      activatedBoardIds.add(ranking.sourceBoardId)
    }
    const hasFeaturedSlot =
      ranking.featuredRank !== null && ranking.featuredBadge !== null
    await ctx.db.patch(ranking._id, {
      visibility: 'public',
      publicationState: 'published',
      isPubliclyListable: true,
      isFeatured: hasFeaturedSlot,
      seedReleaseStatus: 'active',
      updatedAt: now,
    })
  }
  await patchSeedBoardStatuses(ctx, activatedBoardIds, 'active', now)

  const aggregateJobsQueued =
    params.queueAggregates === false
      ? 0
      : await queueTouchedAggregates(
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
    assertNonemptyString('datasetKey', args.datasetKey)
    assertNonemptyString('releaseId', args.releaseId)
    return await activateSeedRankingReleaseInternal(ctx, {
      datasetKey: args.datasetKey,
      releaseId: args.releaseId,
      queueAggregates: args.queueAggregates,
    })
  },
})

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
    // rollback is just "make the target release the sole active one" — same
    // contract as activate, but the caller has signaled intent that the
    // current active is being intentionally replaced rather than promoted
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
    assertNonemptyString('datasetKey', args.datasetKey)
    assertNonemptyString('releaseId', args.releaseId)
    const rows = await loadSeedRankingsForAggregateQueue(
      ctx,
      args.datasetKey,
      args.releaseId
    )
    const aggregateJobsQueued = await queueTouchedAggregates(
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
