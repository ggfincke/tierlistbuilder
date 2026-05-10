// convex/marketplace/seedPipeline/runs.ts
// run-record helpers: load/summarize/transition seedRuns rows; small input
// assertions reused across public surfaces

import { ConvexError } from 'convex/values'
import type { Doc, Id } from '../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import type { SeedRunSummary } from '@tierlistbuilder/contracts/marketplace/seedPipeline'
import { assertNonnegativeInteger } from '../../lib/assertions'
import { SEED_LIMITS } from '../../lib/limits'
import type { SeedDiagnosticRow } from './types'

export const assertBatchSize = (name: string, count: number): void =>
{
  if (count > SEED_LIMITS.stateIds)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidInput,
      message: `${name} exceeds seed precheck batch limit`,
    })
  }
}

export const assertSeedCompiledTotals = (
  totals: Record<string, number>
): void =>
{
  for (const [key, value] of Object.entries(totals))
  {
    assertNonnegativeInteger(`expectedTotals.${key}`, value)
  }
}

export const hasErrorDiagnostics = (
  diagnostics: readonly SeedDiagnosticRow[]
): boolean => diagnostics.some((diagnostic) => diagnostic.severity === 'error')

export const summarizeRun = (run: Doc<'seedRuns'>): SeedRunSummary => ({
  runId: run.runId,
  datasetKey: run.datasetKey,
  releaseId: run.releaseId,
  status: run.status,
  startedAt: run._creationTime,
  finishedAt: run.finishedAt,
  startedBy: run.startedBy,
  templateCount: run.templateCount,
  itemCount: run.itemCount,
  imageVariantCount: run.imageVariantCount,
  error: run.error,
})

export const currentSeedActor = async (
  ctx: MutationCtx | QueryCtx
): Promise<string> =>
{
  const identity = await ctx.auth.getUserIdentity()
  return identity?.tokenIdentifier ?? identity?.email ?? 'seed-secret'
}

export const findSeedAuthorId = async (
  ctx: QueryCtx | MutationCtx,
  authorEmail: string
): Promise<Id<'users'> | null> =>
{
  const user = await ctx.db
    .query('users')
    .withIndex('email', (q) => q.eq('email', authorEmail))
    .unique()
  return user?._id ?? null
}

export const loadSeedRun = async (
  ctx: QueryCtx | MutationCtx,
  datasetKey: string,
  releaseId: string,
  runId: string
): Promise<Doc<'seedRuns'> | null> =>
{
  const run = await ctx.db
    .query('seedRuns')
    .withIndex('byRunId', (q) => q.eq('runId', runId))
    .unique()
  if (!run || run.datasetKey !== datasetKey || run.releaseId !== releaseId)
  {
    return null
  }
  return run
}

export const loadSeedRunOrThrow = async (
  ctx: QueryCtx | MutationCtx,
  datasetKey: string,
  releaseId: string,
  runId: string
): Promise<Doc<'seedRuns'>> =>
{
  const run = await loadSeedRun(ctx, datasetKey, releaseId, runId)
  if (!run)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.notFound,
      message: `seed run not found: ${runId}`,
    })
  }
  return run
}

export const loadLatestSeedRunForRelease = async (
  ctx: MutationCtx,
  datasetKey: string,
  releaseId: string
): Promise<Doc<'seedRuns'> | null> =>
{
  const runs = await ctx.db
    .query('seedRuns')
    .withIndex('byDatasetRelease', (q) =>
      q.eq('datasetKey', datasetKey).eq('releaseId', releaseId)
    )
    .order('desc')
    .take(1)
  return runs[0] ?? null
}

export const setSeedRunStatus = async (
  ctx: MutationCtx,
  run: Doc<'seedRuns'>,
  status: Doc<'seedRuns'>['status'],
  error: string | null = null,
  now = Date.now()
): Promise<void> =>
{
  const terminalStatuses = new Set<Doc<'seedRuns'>['status']>([
    'active',
    'verified',
    'failed',
    'rolled_back',
  ])
  const finishedAt = terminalStatuses.has(status) ? now : run.finishedAt
  if (
    run.status === status &&
    run.error === error &&
    run.finishedAt === finishedAt
  )
  {
    return
  }
  await ctx.db.patch(run._id, { status, error, finishedAt })
}
