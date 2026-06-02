// convex/marketplace/seed/rankings/actions.ts
// seed-gated writer for release-owned marketplace ranking snapshots

import { ConvexError, v } from 'convex/values'
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type QueryCtx,
} from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import type { Doc } from '../../../_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { assertNonemptyString } from '../../../lib/assertions'
import { isConvexWriteThrottleError, sleep } from '../../../lib/retry'
import { loadSeedTemplateLookupForRelease } from '../lib/templates'
import { resolveActiveTemplateCriterion } from '../../templates/criteria'
import { loadTemplateItems } from '../../templates/lib/projections'
import {
  assertSeedReleaseArgs,
  assertSeedRunArgs,
  hasErrorDiagnostics,
} from '../lib/runRecords'
import {
  queueTemplateRankingAggregateRecompute,
  scheduleTemplateRankingAggregateJobAdmission,
} from '../../rankings/aggregate/lib'
import {
  seedRankingApplyChunkResultValidator,
  seedRankingAuthorEnsureResultValidator,
  seedRankingPreflightResultValidator,
  seedRankingsManifestValidator,
  type SeedRankingApplyChunkResult,
  type SeedRankingAuthorEnsureResult,
  type SeedRankingPreflightResult,
  type SeedRankingsManifest,
} from './validators'
import type { SeedDiagnosticRow } from '../lib/types'
import {
  seedErrorDiagnostic,
  seedWarningDiagnostic,
  pushCountMismatchDiagnostic,
} from '../lib/diagnostics'
import { companionBoardSeedId, isSeedRankingAuthorEmail } from './naming'
import { mapItemsToCuratedTiers } from './curatedResolver'
import {
  deleteSeedBoardWithChildren,
  deleteSeedRankingWithChildren,
} from './cleanup'
import { buildSeedRankingPlan, type SeedRankingPlan } from './plan'
import { findSeedRowByExternalId, takeBoundedSeedRankings } from './rows'
import {
  chunkTaskGroup,
  groupTasksByTemplate,
  resolveSeedRankingTask,
  seedTemplateTaskBatchResultValidator,
  serializedApplyTaskValidator,
  type SeedTemplateTaskBatchResult,
  type SerializedTemplateTaskGroup,
} from './tasks'
import { insertSeedRanking, requireSeedTemplate } from './writes'

// Scan a small page to skip planned rows, but delete at most one stale
// ranking per mutation because each delete can cascade through ranking items,
// tiers, & a companion board.
const STALE_RANKING_CLEANUP_SCAN_PAGE_SIZE = 16
// Ranking seed writes are document-heavy. Start near the local write ceiling,
// then back off per batch if Convex reports deployment write-rate pressure.
const SEED_RANKING_BATCH_DELAY_MS = 750
const SEED_RANKING_BATCH_MAX_ATTEMPTS = 6
const SEED_RANKING_BATCH_RETRY_BASE_MS = 1500
const SEED_RANKING_BATCH_RETRY_MAX_MS = 12000

const seedRankingBatchRetryDelay = (attempt: number): number =>
  Math.min(
    SEED_RANKING_BATCH_RETRY_MAX_MS,
    SEED_RANKING_BATCH_RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1)
  )

// Wrap a seed-pipeline action call w/ throttle-aware retries. label flows
// into the safety-net error message so the originating call site is
// identifiable if the budget ever exhausts.
const runSeedActionWithThrottleRetries = async <T>(
  invoke: () => Promise<T>,
  label: string
): Promise<T> =>
{
  for (let attempt = 1; attempt <= SEED_RANKING_BATCH_MAX_ATTEMPTS; attempt++)
  {
    try
    {
      return await invoke()
    }
    catch (error)
    {
      if (
        !isConvexWriteThrottleError(error) ||
        attempt >= SEED_RANKING_BATCH_MAX_ATTEMPTS
      )
      {
        throw error
      }
      await sleep(seedRankingBatchRetryDelay(attempt))
    }
  }
  throw new ConvexError({
    code: CONVEX_ERROR_CODES.invalidState,
    message: `${label} retry loop exited unexpectedly`,
  })
}

const ensureRankingSeedAuthors = async (
  ctx: ActionCtx,
  authorPassword: string,
  plan: SeedRankingPlan
): Promise<{
  authorsCreated: number
  authorsReused: number
  authorsPatched: number
}> =>
{
  let authorsCreated = 0
  let authorsReused = 0
  let authorsPatched = 0
  for (const author of plan.authors)
  {
    const ensured: { created: boolean } = await ctx.runAction(
      internal.marketplace.seed.templates.endpoints.ensureSeedAuthor,
      { email: author.email, password: authorPassword }
    )
    if (ensured.created) authorsCreated += 1
    else authorsReused += 1
    const patched: { found: boolean } = await ctx.runMutation(
      internal.marketplace.seed.templates.maintenance.patchSeedUserProfileImpl,
      { email: author.email, displayName: author.displayName }
    )
    if (patched.found) authorsPatched += 1
  }
  return { authorsCreated, authorsReused, authorsPatched }
}

const countStringValues = (values: readonly string[]): Map<string, number> =>
{
  const counts = new Map<string, number>()
  for (const value of values)
  {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return counts
}

const appendSeedRankingIdentityDiagnostics = (
  diagnostics: SeedDiagnosticRow[],
  plan: SeedRankingPlan,
  existingRows: readonly Doc<'publishedRankings'>[]
): void =>
{
  const plannedCounts = countStringValues(plan.plannedSeedExternalIds)
  const actualIds: string[] = []
  for (const ranking of existingRows)
  {
    if (ranking.seedExternalId === null)
    {
      diagnostics.push(
        seedErrorDiagnostic(
          'missingSeedRankingExternalId',
          `$.rankingSeeds.rows[${ranking._id}]`,
          'stored seed ranking is missing seedExternalId'
        )
      )
      continue
    }
    actualIds.push(ranking.seedExternalId)
  }

  const actualCounts = countStringValues(actualIds)
  for (const [seedExternalId, plannedCount] of plannedCounts)
  {
    const actualCount = actualCounts.get(seedExternalId) ?? 0
    if (actualCount >= plannedCount) continue
    diagnostics.push(
      seedErrorDiagnostic(
        'missingSeedRanking',
        '$.rankingSeeds',
        `missing planned seed ranking ${seedExternalId}: expected ${plannedCount}, found ${actualCount}`
      )
    )
  }
  for (const [seedExternalId, actualCount] of actualCounts)
  {
    const plannedCount = plannedCounts.get(seedExternalId) ?? 0
    if (actualCount <= plannedCount) continue
    diagnostics.push(
      seedErrorDiagnostic(
        'staleSeedRanking',
        '$.rankingSeeds',
        `unexpected stored seed ranking ${seedExternalId}: expected ${plannedCount}, found ${actualCount}`
      )
    )
  }
}

export const deleteStaleSeedRankingRowsImpl = internalMutation({
  args: {
    datasetKey: v.string(),
    releaseId: v.string(),
    plannedSeedExternalIds: v.array(v.string()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({
    rankingsDeleted: v.number(),
    boardsDeleted: v.number(),
    cursor: v.union(v.string(), v.null()),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) =>
  {
    assertSeedReleaseArgs(args)
    const planned = new Set(args.plannedSeedExternalIds)
    const page = await ctx.db
      .query('publishedRankings')
      .withIndex('bySeedDatasetReleaseAndExternalId', (q) =>
        q
          .eq('seedDatasetKey', args.datasetKey)
          .eq('seedReleaseId', args.releaseId)
      )
      .paginate({
        numItems: STALE_RANKING_CLEANUP_SCAN_PAGE_SIZE,
        cursor: args.cursor ?? null,
      })

    let rankingToDelete: Doc<'publishedRankings'> | null = null
    let pageHasAdditionalStaleRanking = false
    for (const ranking of page.page)
    {
      const seedExternalId = ranking.seedExternalId
      if (seedExternalId === null || planned.has(seedExternalId)) continue
      if (rankingToDelete === null)
      {
        rankingToDelete = ranking
        continue
      }
      pageHasAdditionalStaleRanking = true
      break
    }

    if (rankingToDelete === null)
    {
      return {
        rankingsDeleted: 0,
        boardsDeleted: 0,
        cursor: page.isDone ? null : page.continueCursor,
        isDone: page.isDone,
      }
    }

    const seedExternalId = rankingToDelete.seedExternalId
    if (seedExternalId === null)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: 'stale seed ranking is missing seedExternalId',
      })
    }
    const boardSeedId = companionBoardSeedId(seedExternalId)
    const sourceBoard =
      rankingToDelete.sourceBoardId !== null
        ? await ctx.db.get(rankingToDelete.sourceBoardId)
        : null
    const board =
      sourceBoard ??
      (await findSeedRowByExternalId(ctx, 'boards', {
        datasetKey: args.datasetKey,
        releaseId: args.releaseId,
        seedExternalId: boardSeedId,
      }))
    // Capture the lane before delete: if this was the last active ranking in
    // the lane, the apply-time queue-active pass would never discover the lane
    // & aggregate counts would stay stale forever.
    await queueTemplateRankingAggregateRecompute(
      ctx,
      rankingToDelete.sourceTemplateId,
      rankingToDelete.sourceCriterionExternalId,
      Date.now(),
      { scheduleAdmission: false }
    )
    await scheduleTemplateRankingAggregateJobAdmission(ctx)
    await deleteSeedRankingWithChildren(ctx, rankingToDelete)
    let boardsDeleted = 0
    if (
      board &&
      board.seedDatasetKey === args.datasetKey &&
      board.seedReleaseId === args.releaseId
    )
    {
      await deleteSeedBoardWithChildren(ctx, board)
      boardsDeleted = 1
    }

    return {
      rankingsDeleted: 1,
      boardsDeleted,
      cursor:
        page.isDone && !pageHasAdditionalStaleRanking
          ? null
          : (args.cursor ?? null),
      isDone: page.isDone && !pageHasAdditionalStaleRanking,
    }
  },
})

export const upsertSeedRankingsForTemplateImpl = internalMutation({
  args: {
    datasetKey: v.string(),
    releaseId: v.string(),
    rankingSeeds: seedRankingsManifestValidator,
    templateExternalId: v.string(),
    tasks: v.array(serializedApplyTaskValidator),
  },
  returns: seedTemplateTaskBatchResultValidator,
  handler: async (ctx, args): Promise<SeedTemplateTaskBatchResult> =>
  {
    const target = args.rankingSeeds.targets.find(
      (entry) => entry.templateExternalId === args.templateExternalId
    )
    if (!target)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: `apply batch references unknown target: ${args.templateExternalId}`,
      })
    }
    const template = await requireSeedTemplate(
      ctx,
      args.datasetKey,
      args.releaseId,
      args.templateExternalId
    )
    const items = await loadTemplateItems(ctx, template._id)
    const totals: SeedTemplateTaskBatchResult = {
      rankingsDeleted: 0,
      boardsDeleted: 0,
      rankingsUnchanged: 0,
      tiersWritten: 0,
      itemsWritten: 0,
      sampleRankingsApplied: 0,
      curatedRankingsApplied: 0,
    }
    for (const task of args.tasks)
    {
      const resolved = resolveSeedRankingTask({
        rankingSeeds: args.rankingSeeds,
        target,
        task,
        template,
        items,
      })
      const inserted = await insertSeedRanking(ctx, {
        datasetKey: args.datasetKey,
        releaseId: args.releaseId,
        templateExternalId: args.templateExternalId,
        criterionExternalId: resolved.criterionExternalId,
        template,
        createdAt:
          Date.now() -
          Math.max(1, task.sequence) * resolved.insertArgs.createdAtOffsetMs,
        ...resolved.insertArgs,
      })
      totals.sampleRankingsApplied += resolved.sampleRankingsApplied
      totals.curatedRankingsApplied += resolved.curatedRankingsApplied
      totals.rankingsDeleted += inserted.rankingsDeleted
      totals.boardsDeleted += inserted.boardsDeleted
      totals.rankingsUnchanged += inserted.rankingsUnchanged
      totals.tiersWritten += inserted.tiersWritten
      totals.itemsWritten += inserted.itemsWritten
    }
    return totals
  },
})

const buildPreflight = async (
  ctx: QueryCtx,
  args: {
    datasetKey: string
    releaseId: string
    rankingSeeds: SeedRankingsManifest
    verifyAppliedRows: boolean
  }
): Promise<SeedRankingPreflightResult> =>
{
  assertSeedReleaseArgs(args)
  const diagnostics: SeedDiagnosticRow[] = []
  const profileKeys = new Set<string>()
  for (const [index, profile] of args.rankingSeeds.profiles.entries())
  {
    if (profileKeys.has(profile.key))
    {
      diagnostics.push(
        seedErrorDiagnostic(
          'duplicateProfileKey',
          `$.rankingSeeds.profiles[${index}].key`,
          profile.key
        )
      )
    }
    profileKeys.add(profile.key)
  }

  const plan = buildSeedRankingPlan(args.rankingSeeds)
  const authorEmails = new Set<string>()
  for (const author of plan.authors)
  {
    if (!isSeedRankingAuthorEmail(author.email))
    {
      diagnostics.push(
        seedErrorDiagnostic(
          'invalidSeedAuthorEmail',
          '$.rankingSeeds',
          author.email
        )
      )
    }
    if (authorEmails.has(author.email))
    {
      diagnostics.push(
        seedErrorDiagnostic(
          'duplicateSeedAuthorEmail',
          '$.rankingSeeds',
          author.email
        )
      )
    }
    authorEmails.add(author.email)
  }

  const { byExternalId } = await loadSeedTemplateLookupForRelease(
    ctx,
    args.datasetKey,
    args.releaseId
  )
  const seenTargets = new Set<string>()
  for (const [targetIndex, target] of args.rankingSeeds.targets.entries())
  {
    const targetPath = `$.rankingSeeds.targets[${targetIndex}]`
    if (seenTargets.has(target.templateExternalId))
    {
      diagnostics.push(
        seedErrorDiagnostic(
          'duplicateRankingSeedTarget',
          `${targetPath}.templateExternalId`,
          target.templateExternalId
        )
      )
    }
    seenTargets.add(target.templateExternalId)
    const template = byExternalId.get(target.templateExternalId)
    if (!template)
    {
      diagnostics.push(
        seedErrorDiagnostic(
          'missingTemplate',
          `${targetPath}.templateExternalId`,
          target.templateExternalId
        )
      )
      continue
    }
    const seenCriteria = new Set<string>()
    for (const [laneIndex, lane] of target.lanes.entries())
    {
      const lanePath = `${targetPath}.lanes[${laneIndex}]`
      if (seenCriteria.has(lane.criterionExternalId))
      {
        diagnostics.push(
          seedErrorDiagnostic(
            'duplicateRankingSeedLane',
            `${lanePath}.criterionExternalId`,
            lane.criterionExternalId
          )
        )
      }
      seenCriteria.add(lane.criterionExternalId)
      try
      {
        resolveActiveTemplateCriterion(template, lane.criterionExternalId)
      }
      catch (error)
      {
        diagnostics.push(
          seedErrorDiagnostic(
            'missingCriterion',
            `${lanePath}.criterionExternalId`,
            error instanceof Error ? error.message : lane.criterionExternalId
          )
        )
      }
    }

    const featuredSlots = new Set<string>()
    const curatedRankings = target.curatedRankings ?? []
    const templateItemsForCurated =
      curatedRankings.length > 0
        ? await loadTemplateItems(ctx, template._id)
        : []
    for (const [curatedIndex, curated] of curatedRankings.entries())
    {
      const curatedPath = `${targetPath}.curatedRankings[${curatedIndex}]`
      try
      {
        resolveActiveTemplateCriterion(template, curated.criterionExternalId)
        mapItemsToCuratedTiers(curated, templateItemsForCurated, curatedPath)
      }
      catch (error)
      {
        diagnostics.push(
          seedErrorDiagnostic(
            'invalidCuratedRanking',
            curatedPath,
            error instanceof Error ? error.message : curated.externalId
          )
        )
      }
      if (curated.featuredRank !== null)
      {
        const slot = `${curated.criterionExternalId}:${curated.featuredRank}`
        if (featuredSlots.has(slot))
        {
          diagnostics.push(
            seedErrorDiagnostic(
              'duplicateFeaturedRank',
              `${curatedPath}.featuredRank`,
              slot
            )
          )
        }
        featuredSlots.add(slot)
        if (curated.featuredBadge === null)
        {
          diagnostics.push(
            seedErrorDiagnostic(
              'missingFeaturedBadge',
              `${curatedPath}.featuredBadge`,
              curated.externalId
            )
          )
        }
      }
    }
    if (curatedRankings.length === 0)
    {
      diagnostics.push(
        seedWarningDiagnostic(
          'targetHasNoCuratedRankings',
          targetPath,
          target.templateExternalId
        )
      )
    }
  }

  const [existingSeedRankingRows, existingActiveSeedRankingRows] =
    await Promise.all([
      takeBoundedSeedRankings(ctx, {
        datasetKey: args.datasetKey,
        releaseId: args.releaseId,
        overLimitMessage: 'seed ranking release exceeds read limit',
      }),
      takeBoundedSeedRankings(ctx, {
        datasetKey: args.datasetKey,
        releaseId: args.releaseId,
        status: 'active',
        overLimitMessage: 'seed ranking release exceeds read limit',
      }),
    ])
  const existingSeedRankings = existingSeedRankingRows.length
  const existingActiveSeedRankings = existingActiveSeedRankingRows.length
  if (
    args.verifyAppliedRows &&
    existingSeedRankings !==
      plan.sampleRankingsPlanned + plan.curatedRankingsPlanned
  )
  {
    pushCountMismatchDiagnostic(
      diagnostics,
      'seedRankingCountMismatch',
      '$.rankingSeeds',
      plan.sampleRankingsPlanned + plan.curatedRankingsPlanned,
      existingSeedRankings,
      'seed rankings'
    )
  }
  if (args.verifyAppliedRows)
  {
    appendSeedRankingIdentityDiagnostics(
      diagnostics,
      plan,
      existingSeedRankingRows
    )
  }

  return {
    datasetKey: args.datasetKey,
    releaseId: args.releaseId,
    profileCount: args.rankingSeeds.profiles.length,
    authorCount: plan.authors.length,
    targetCount: args.rankingSeeds.targets.length,
    sampleRankingsPlanned: plan.sampleRankingsPlanned,
    curatedRankingsPlanned: plan.curatedRankingsPlanned,
    existingSeedRankings,
    existingActiveSeedRankings,
    aggregateLanes: plan.laneSummaries,
    diagnostics,
  }
}

export const preflightSeedRankings = internalQuery({
  args: {
    datasetKey: v.string(),
    releaseId: v.string(),
    rankingSeeds: seedRankingsManifestValidator,
  },
  returns: seedRankingPreflightResultValidator,
  handler: async (ctx, args): Promise<SeedRankingPreflightResult> =>
    await buildPreflight(ctx, { ...args, verifyAppliedRows: false }),
})

const throwIfRankingPreflightErrors = (
  diagnostics: readonly SeedDiagnosticRow[]
): void =>
{
  if (!hasErrorDiagnostics(diagnostics)) return
  throw new ConvexError({
    code: CONVEX_ERROR_CODES.invalidInput,
    message: 'ranking seed preflight failed',
    diagnostics: [...diagnostics],
  })
}

export const verifySeedRankings = internalQuery({
  args: {
    datasetKey: v.string(),
    releaseId: v.string(),
    rankingSeeds: seedRankingsManifestValidator,
  },
  returns: seedRankingPreflightResultValidator,
  handler: async (ctx, args): Promise<SeedRankingPreflightResult> =>
    await buildPreflight(ctx, { ...args, verifyAppliedRows: true }),
})

const runSeedRankingTemplateBatch = async (
  ctx: ActionCtx,
  datasetKey: string,
  releaseId: string,
  manifest: SeedRankingsManifest,
  group: SerializedTemplateTaskGroup
): Promise<SeedTemplateTaskBatchResult> =>
  await ctx.runMutation(
    internal.marketplace.seed.rankings.actions
      .upsertSeedRankingsForTemplateImpl,
    {
      datasetKey,
      releaseId,
      rankingSeeds: manifest,
      templateExternalId: group.templateExternalId,
      tasks: group.tasks,
    }
  )

export const applySeedRankingChunk = internalAction({
  args: {
    datasetKey: v.string(),
    releaseId: v.string(),
    runId: v.string(),
    rankingSeeds: seedRankingsManifestValidator,
  },
  returns: seedRankingApplyChunkResultValidator,
  handler: async (ctx, args): Promise<SeedRankingApplyChunkResult> =>
  {
    assertSeedRunArgs(args)

    const plan = buildSeedRankingPlan(args.rankingSeeds)
    const groups = groupTasksByTemplate(plan).flatMap(chunkTaskGroup)
    const totals = {
      boardsReplaced: 0,
      rankingsReplaced: 0,
      rankingsUnchanged: 0,
      rankingTiersWritten: 0,
      rankingItemsWritten: 0,
      sampleRankingsApplied: 0,
      curatedRankingsApplied: 0,
    }
    for (const [index, group] of groups.entries())
    {
      const result = await runSeedActionWithThrottleRetries(
        () =>
          runSeedRankingTemplateBatch(
            ctx,
            args.datasetKey,
            args.releaseId,
            args.rankingSeeds,
            group
          ),
        'ranking seed batch'
      )
      totals.boardsReplaced += result.boardsDeleted
      totals.rankingsReplaced += result.rankingsDeleted
      totals.rankingsUnchanged += result.rankingsUnchanged
      totals.rankingTiersWritten += result.tiersWritten
      totals.rankingItemsWritten += result.itemsWritten
      totals.sampleRankingsApplied += result.sampleRankingsApplied
      totals.curatedRankingsApplied += result.curatedRankingsApplied
      if (index < groups.length - 1)
      {
        await sleep(SEED_RANKING_BATCH_DELAY_MS)
      }
    }

    return {
      datasetKey: args.datasetKey,
      releaseId: args.releaseId,
      ...totals,
      aggregateLanes: plan.laneSummaries,
    }
  },
})

export const cleanupStaleSeedRankings = internalAction({
  args: {
    datasetKey: v.string(),
    releaseId: v.string(),
    runId: v.string(),
    rankingSeeds: seedRankingsManifestValidator,
  },
  returns: v.object({
    datasetKey: v.string(),
    releaseId: v.string(),
    rankingsDeleted: v.number(),
    boardsDeleted: v.number(),
  }),
  handler: async (ctx, args) =>
  {
    assertSeedRunArgs(args)
    const plannedSeedExternalIds = buildSeedRankingPlan(
      args.rankingSeeds
    ).plannedSeedExternalIds
    let rankingsDeleted = 0
    let boardsDeleted = 0
    let cursor: string | null = null
    while (true)
    {
      const result: {
        rankingsDeleted: number
        boardsDeleted: number
        cursor: string | null
        isDone: boolean
      } = await runSeedActionWithThrottleRetries(
        () =>
          ctx.runMutation(
            internal.marketplace.seed.rankings.actions
              .deleteStaleSeedRankingRowsImpl,
            {
              datasetKey: args.datasetKey,
              releaseId: args.releaseId,
              plannedSeedExternalIds,
              cursor,
            }
          ),
        'ranking stale cleanup'
      )
      rankingsDeleted += result.rankingsDeleted
      boardsDeleted += result.boardsDeleted
      if (result.isDone) break
      cursor = result.cursor
      if (result.rankingsDeleted > 0 || result.boardsDeleted > 0)
      {
        await sleep(SEED_RANKING_BATCH_DELAY_MS)
      }
    }
    return {
      datasetKey: args.datasetKey,
      releaseId: args.releaseId,
      rankingsDeleted,
      boardsDeleted,
    }
  },
})

export const ensureSeedRankingAuthors = internalAction({
  args: {
    datasetKey: v.string(),
    releaseId: v.string(),
    runId: v.string(),
    authorPassword: v.string(),
    rankingSeeds: seedRankingsManifestValidator,
  },
  returns: seedRankingAuthorEnsureResultValidator,
  handler: async (ctx, args): Promise<SeedRankingAuthorEnsureResult> =>
  {
    assertSeedRunArgs(args)
    assertNonemptyString('authorPassword', args.authorPassword)
    const preflight: SeedRankingPreflightResult = await ctx.runQuery(
      internal.marketplace.seed.rankings.actions.preflightSeedRankings,
      {
        datasetKey: args.datasetKey,
        releaseId: args.releaseId,
        rankingSeeds: args.rankingSeeds,
      }
    )
    throwIfRankingPreflightErrors(preflight.diagnostics)
    const plan = buildSeedRankingPlan(args.rankingSeeds)
    const result = await ensureRankingSeedAuthors(
      ctx,
      args.authorPassword,
      plan
    )
    return {
      datasetKey: args.datasetKey,
      releaseId: args.releaseId,
      ...result,
      diagnostics: preflight.diagnostics,
    }
  },
})

export type { Id } from '../../../_generated/dataModel'
export type { SeedRankingKind } from './naming'
