// convex/marketplace/rankings/seedLifecycle.ts
// release activation & rollback for seed-owned ranking rows

import { ConvexError, v } from 'convex/values'
import { internalMutation, type MutationCtx } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { assertNonemptyString } from '../../lib/assertions'
import { SEED_LIMITS } from '../../lib/limits'
import { resolveActiveReleaseIds } from '../seedPipeline/resolvers'
import { queueTemplateRankingAggregateRecompute } from './aggregate'
import {
  seedRankingActivationResultValidator,
  type SeedRankingActivationResult,
} from './seedValidators'

type SeedRankingReleaseStatus = NonNullable<
  Doc<'publishedRankings'>['seedReleaseStatus']
>

const assertSeedRankingReadLimit = (
  rows: readonly Doc<'publishedRankings'>[],
  releaseId: string
): void =>
{
  if (rows.length <= SEED_LIMITS.rankingSeedRowsPerRelease) return
  throw new ConvexError({
    code: CONVEX_ERROR_CODES.invalidState,
    message: `seed ranking release exceeds read limit: ${releaseId}`,
  })
}

export const loadSeedRankingsForRelease = async (
  ctx: MutationCtx,
  datasetKey: string,
  releaseId: string
): Promise<Doc<'publishedRankings'>[]> =>
{
  const rows = await ctx.db
    .query('publishedRankings')
    .withIndex('bySeedDatasetReleaseAndExternalId', (q) =>
      q.eq('seedDatasetKey', datasetKey).eq('seedReleaseId', releaseId)
    )
    .take(SEED_LIMITS.rankingSeedRowsPerRelease + 1)
  assertSeedRankingReadLimit(rows, releaseId)
  return rows
}

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
    .take(SEED_LIMITS.rankingSeedRowsPerRelease + 1)
  assertSeedRankingReadLimit(rows, releaseId)
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
      const board = await ctx.db.get(boardId)
      if (!board || board.seedDatasetKey === null) return
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
      now
    )
  }
  return queued.size
}

export const activateSeedRankingReleaseInternal = async (
  ctx: MutationCtx,
  params: {
    datasetKey: string
    releaseId: string
    previousReleaseIds: readonly string[]
  }
): Promise<SeedRankingActivationResult> =>
{
  const now = Date.now()
  const rolledBackRows: Doc<'publishedRankings'>[] = []
  const rolledBackBoardIds = new Set<Id<'boards'>>()

  for (const previousReleaseId of params.previousReleaseIds)
  {
    if (previousReleaseId === params.releaseId) continue
    const rows = await loadSeedRankingsForReleaseStatus(
      ctx,
      params.datasetKey,
      previousReleaseId,
      'active'
    )
    for (const ranking of rows)
    {
      rolledBackRows.push(ranking)
      rolledBackBoardIds.add(ranking.sourceBoardId)
      await ctx.db.patch(ranking._id, {
        publicationState: 'unpublished',
        isPubliclyListable: false,
        isFeatured: false,
        seedReleaseStatus: 'rolled_back',
        updatedAt: now,
      })
    }
  }
  await patchSeedBoardStatuses(ctx, rolledBackBoardIds, 'rolled_back', now)

  const targetRows = (
    await loadSeedRankingsForRelease(ctx, params.datasetKey, params.releaseId)
  ).filter((ranking) => ranking.seedReleaseStatus !== 'rolled_back')
  const activatedBoardIds = new Set<Id<'boards'>>()
  for (const ranking of targetRows)
  {
    activatedBoardIds.add(ranking.sourceBoardId)
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

  const aggregateJobsQueued = await queueTouchedAggregates(
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
  },
  returns: seedRankingActivationResultValidator,
  handler: async (ctx, args): Promise<SeedRankingActivationResult> =>
  {
    assertNonemptyString('datasetKey', args.datasetKey)
    assertNonemptyString('releaseId', args.releaseId)
    const activeReleaseIds = await resolveActiveReleaseIds(ctx, args.datasetKey)
    return await activateSeedRankingReleaseInternal(ctx, {
      datasetKey: args.datasetKey,
      releaseId: args.releaseId,
      previousReleaseIds: activeReleaseIds,
    })
  },
})

export const rollbackSeedRankings = internalMutation({
  args: {
    datasetKey: v.string(),
    releaseId: v.string(),
    targetReleaseId: v.string(),
  },
  returns: seedRankingActivationResultValidator,
  handler: async (ctx, args): Promise<SeedRankingActivationResult> =>
  {
    assertNonemptyString('datasetKey', args.datasetKey)
    assertNonemptyString('releaseId', args.releaseId)
    assertNonemptyString('targetReleaseId', args.targetReleaseId)
    if (args.releaseId === args.targetReleaseId)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidInput,
        message: 'ranking rollback target must differ from releaseId',
      })
    }
    return await activateSeedRankingReleaseInternal(ctx, {
      datasetKey: args.datasetKey,
      releaseId: args.targetReleaseId,
      previousReleaseIds: [args.releaseId],
    })
  },
})
