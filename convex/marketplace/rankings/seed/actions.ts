// convex/marketplace/rankings/seed/actions.ts
// seed-gated writer for release-owned marketplace ranking snapshots

import { ConvexError, v } from 'convex/values'
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import type { Doc, Id } from '../../../_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import type { RankingFeaturedBadge } from '@tierlistbuilder/contracts/marketplace/ranking'
import type { TierPresetTier } from '@tierlistbuilder/contracts/workspace/tierPreset'
import { assertCountRange, assertNonemptyString } from '../../../lib/assertions'
import { SEED_LIMITS } from '../../../lib/limits'
import { isConvexWriteThrottleError, sleep } from '../../../lib/retry'
import { seedContentHash } from '../../../lib/seedContentHash'
import { loadSeedTemplateLookupForRelease } from '../../seedPipeline/templates'
import {
  resolveActiveTemplateCriterion,
  toTemplateCriterionSnapshot,
} from '../../templates/criteria'
import { loadTemplateItems } from '../../templates/lib/projections'
import {
  allocateRankingSlug,
  normalizeRankingDescription,
  normalizeRankingTitle,
  rankingTopScore,
} from '../lib'
import {
  assertSeedReleaseArgs,
  assertSeedRunArgs,
  hasErrorDiagnostics,
} from '../../seedPipeline/runs'
import {
  queueTemplateRankingAggregateRecompute,
  scheduleTemplateRankingAggregateJobAdmission,
} from '../aggregate/lib'
import {
  seedRankingApplyChunkResultValidator,
  seedRankingAuthorEnsureResultValidator,
  seedRankingPreflightResultValidator,
  seedRankingsManifestValidator,
  type SeedCuratedRanking,
  type SeedRankingApplyChunkResult,
  type SeedRankingAuthorEnsureResult,
  type SeedRankingLane,
  type SeedRankingPreflightResult,
  type SeedRankingProfile,
  type SeedRankingTarget,
  type SeedRankingsManifest,
} from './validators'
import type { SeedDiagnosticRow } from '../../seedPipeline/types'
import {
  seedErrorDiagnostic,
  seedWarningDiagnostic,
} from '../../seedPipeline/diagnostics'
import {
  companionBoardSeedId,
  curatedAuthorEmail,
  curatedSeedAuthorKey,
  formatBoardSeedId,
  formatRankingSeedId,
  formatTierSeedId,
  isSeedRankingAuthorEmail,
  sampleAuthorEmail,
  type SeedRankingKind,
} from './naming'
import {
  featuredForProfile,
  rankTemplateItemsWithScore,
  resolveTemplateTiers,
  scoreLaneItem,
  seedUnitHash,
  type RankedSeedItem,
} from './scoring'
import { mapItemsToCuratedTiers } from './curatedResolver'
import {
  deleteSeedBoardWithChildren,
  deleteSeedRankingWithChildren,
} from './cleanup'
import { buildSeedRankingPlan, type SeedRankingPlan } from './plan'
import {
  findSeedRowByExternalId,
  hasFeaturedSlot,
  takeBoundedSeedRankings,
} from './rows'

const SAMPLE_RANKING_DESCRIPTION =
  'Seeded sample ranking for community feature testing.'
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

interface ReplacementResult
{
  rankingSlug: string | null
  rankingsDeleted: number
  boardsDeleted: number
  rankingsUnchanged: number
  skipped: boolean
}

interface SeedRankingWriteResult
{
  rankingsDeleted: number
  boardsDeleted: number
  rankingsUnchanged: number
  tiersWritten: number
  itemsWritten: number
}

interface InsertSeedRankingArgs
{
  datasetKey: string
  releaseId: string
  templateExternalId: string
  criterionExternalId: string
  authorKey: string
  authorEmail: string
  title: string
  description: string
  seedExternalId: string
  boardExternalId: string
  seedKind: NonNullable<Doc<'publishedRankings'>['seedKind']>
  seedProfileKey: string | null
  seedCuratedExternalId: string | null
  rankedItems: readonly RankedSeedItem[]
  tiers: readonly TierPresetTier[]
  template: Doc<'templates'>
  featuredRank: number | null
  featuredBadge: RankingFeaturedBadge | null
  createdAt: number
  viewCountSeedKey: string
}

type SeedRankingTierEntry = Omit<
  Doc<'publishedRankingTiers'>,
  '_id' | '_creationTime' | 'rankingId'
>

const buildSeedRankingTierEntries = (
  args: InsertSeedRankingArgs
): SeedRankingTierEntry[] =>
  args.tiers.map((tier, order) => ({
    externalId: formatTierSeedId(args.seedExternalId, order),
    order,
    name: tier.name,
    description: tier.description ?? null,
    colorSpec: tier.colorSpec,
    rowColorSpec: tier.rowColorSpec ?? null,
  }))

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
      internal.marketplace.seedRuns.ensureSeedAuthor,
      { email: author.email, password: authorPassword }
    )
    if (ensured.created) authorsCreated += 1
    else authorsReused += 1
    const patched: { found: boolean } = await ctx.runMutation(
      internal.marketplace.templates.seed.patchSeedUserProfileImpl,
      { email: author.email, displayName: author.displayName }
    )
    if (patched.found) authorsPatched += 1
  }
  return { authorsCreated, authorsReused, authorsPatched }
}

const loadExistingSeedRankings = async (
  ctx: QueryCtx,
  datasetKey: string,
  releaseId: string,
  activeOnly = false
): Promise<Doc<'publishedRankings'>[]> =>
  await takeBoundedSeedRankings(ctx, {
    datasetKey,
    releaseId,
    status: activeOnly ? 'active' : undefined,
    overLimitMessage: 'seed ranking release exceeds read limit',
  })

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

const requireSeedTemplate = async (
  ctx: MutationCtx,
  datasetKey: string,
  releaseId: string,
  templateExternalId: string
): Promise<Doc<'templates'>> =>
{
  const template = await findSeedRowByExternalId(ctx, 'templates', {
    datasetKey,
    releaseId,
    seedExternalId: templateExternalId,
  })
  if (!template)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.notFound,
      message: `seed template not found: ${templateExternalId}`,
    })
  }
  return template
}

const requireSeedAuthor = async (
  ctx: MutationCtx,
  email: string
): Promise<Doc<'users'>> =>
{
  if (!isSeedRankingAuthorEmail(email))
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidInput,
      message: `ranking seed author email is outside the seed namespace: ${email}`,
    })
  }
  const user = await ctx.db
    .query('users')
    .withIndex('email', (q) => q.eq('email', email))
    .unique()
  if (!user)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: `ranking seed author was not created: ${email}`,
    })
  }
  return user
}

const buildSeedRankingContentHash = (
  args: InsertSeedRankingArgs,
  criterionSnapshot: {
    externalId: string
    name: string
    prompt: string
  },
  normalized: {
    rankingTitle: string
    rankingDescription: string | null
    viewCount: number
  },
  tierEntries: readonly SeedRankingTierEntry[]
): Promise<string> =>
  seedContentHash('ranking-snapshot', {
    version: 3,
    rankingItemShape: 'template-item-snapshot',
    ranking: {
      seedExternalId: args.seedExternalId,
      seedKind: args.seedKind,
      seedTemplateExternalId: args.templateExternalId,
      seedCriterionExternalId: criterionSnapshot.externalId,
      seedAuthorKey: args.authorKey,
      seedProfileKey: args.seedProfileKey,
      seedCuratedExternalId: args.seedCuratedExternalId,
      sourceTemplateId: args.template._id,
      sourceTemplateSlug: args.template.slug,
      sourceTemplateTitle: args.template.title,
      sourceTemplateCategory: args.template.category,
      criterion: criterionSnapshot,
      title: normalized.rankingTitle,
      description: normalized.rankingDescription,
      itemCount: args.rankedItems.length,
      tierCount: args.tiers.length,
      viewCount: normalized.viewCount,
      featuredRank: args.featuredRank,
      featuredBadge: args.featuredBadge,
    },
    tiers: tierEntries,
    rankedItems: args.rankedItems.map((ranked) => ({
      templateItemId: ranked.item._id,
      templateItemExternalId: ranked.item.externalId,
      label: ranked.item.label,
      backgroundColor: ranked.item.backgroundColor,
      mediaPlate: ranked.item.mediaPlate ?? null,
      altText: ranked.item.altText,
      mediaAssetId: ranked.item.mediaAssetId,
      aspectRatio: ranked.item.aspectRatio,
      imageFit: ranked.item.imageFit,
      transform: ranked.item.transform,
      imagePadding: ranked.item.imagePadding,
      order: ranked.item.order,
      tierIndex: ranked.tierIndex,
      orderInTier: ranked.orderInTier,
      globalOrder: ranked.globalOrder,
    })),
  })

const lifecycleFieldsMatchStatus = (
  ranking: Doc<'publishedRankings'>
): boolean =>
{
  const status = ranking.seedReleaseStatus
  if (status === null) return false
  switch (status)
  {
    case 'active':
    {
      return (
        ranking.visibility === 'public' &&
        ranking.publicationState === 'published' &&
        ranking.isPubliclyListable &&
        ranking.isFeatured === hasFeaturedSlot(ranking)
      )
    }
    case 'applied_hidden':
    case 'rolled_back':
      return (
        ranking.publicationState === 'unpublished' &&
        !ranking.isPubliclyListable &&
        !ranking.isFeatured
      )
    default:
    {
      // exhaustiveness guard — new SeedRankingReleaseStatus values must add
      // their own lifecycle contract here, or seedRowsAreReusable would
      // silently re-delete every row of that status on each apply
      const _exhaustive: never = status
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: `unhandled seed ranking release status: ${String(_exhaustive)}`,
      })
    }
  }
}

const seedRowsAreReusable = (
  ranking: Doc<'publishedRankings'> | null,
  contentHash: string
): boolean =>
  ranking !== null &&
  ranking.seedContentHash === contentHash &&
  ranking.seedReleaseStatus !== null &&
  lifecycleFieldsMatchStatus(ranking)

const replaceExistingSeedRows = async (
  ctx: MutationCtx,
  params: {
    datasetKey: string
    releaseId: string
    rankingSeedExternalId: string
    boardSeedExternalId: string
    contentHash: string
  }
): Promise<ReplacementResult> =>
{
  const [ranking, board] = await Promise.all([
    findSeedRowByExternalId(ctx, 'publishedRankings', {
      datasetKey: params.datasetKey,
      releaseId: params.releaseId,
      seedExternalId: params.rankingSeedExternalId,
    }),
    findSeedRowByExternalId(ctx, 'boards', {
      datasetKey: params.datasetKey,
      releaseId: params.releaseId,
      seedExternalId: params.boardSeedExternalId,
    }),
  ])
  const rankingSlug = ranking?.slug ?? null
  if (seedRowsAreReusable(ranking, params.contentHash))
  {
    if (board) await deleteSeedBoardWithChildren(ctx, board)
    return {
      rankingSlug,
      rankingsDeleted: 0,
      boardsDeleted: board ? 1 : 0,
      rankingsUnchanged: 1,
      skipped: true,
    }
  }
  if (ranking) await deleteSeedRankingWithChildren(ctx, ranking)
  if (board) await deleteSeedBoardWithChildren(ctx, board)
  return {
    rankingSlug,
    rankingsDeleted: ranking ? 1 : 0,
    boardsDeleted: board ? 1 : 0,
    rankingsUnchanged: 0,
    skipped: false,
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

const insertSeedRanking = async (
  ctx: MutationCtx,
  args: InsertSeedRankingArgs
): Promise<SeedRankingWriteResult> =>
{
  assertCountRange(
    'ranking tiers',
    args.tiers.length,
    1,
    SEED_LIMITS.rankingSeedTiersPerRanking
  )
  assertCountRange(
    'ranking items',
    args.rankedItems.length,
    1,
    SEED_LIMITS.rankingSeedItemsPerRanking
  )
  const user = await requireSeedAuthor(ctx, args.authorEmail)
  const criterion = resolveActiveTemplateCriterion(
    args.template,
    args.criterionExternalId
  )
  const criterionSnapshot = toTemplateCriterionSnapshot(criterion)
  const rankingTitle = normalizeRankingTitle(args.title)
  const rankingDescription = normalizeRankingDescription(args.description)
  const viewCount = Math.floor(seedUnitHash(args.viewCountSeedKey) * 24)
  const tierEntries = buildSeedRankingTierEntries(args)
  const contentHash = await buildSeedRankingContentHash(
    args,
    criterionSnapshot,
    {
      rankingTitle,
      rankingDescription,
      viewCount,
    },
    tierEntries
  )
  const replacement = await replaceExistingSeedRows(ctx, {
    datasetKey: args.datasetKey,
    releaseId: args.releaseId,
    rankingSeedExternalId: args.seedExternalId,
    boardSeedExternalId: args.boardExternalId,
    contentHash,
  })
  if (replacement.skipped)
  {
    if (!replacement.rankingSlug)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: `unchanged seed ranking missing slug: ${args.seedExternalId}`,
      })
    }
    return {
      rankingsDeleted: 0,
      boardsDeleted: replacement.boardsDeleted,
      rankingsUnchanged: replacement.rankingsUnchanged,
      tiersWritten: 0,
      itemsWritten: 0,
    }
  }
  const now = Date.now()

  const rankingSlug =
    replacement.rankingSlug ?? (await allocateRankingSlug(ctx))
  const rankingId = await ctx.db.insert('publishedRankings', {
    slug: rankingSlug,
    ownerId: user._id,
    sourceTemplateId: args.template._id,
    sourceBoardId: null,
    sourceTemplateSlug: args.template.slug,
    sourceTemplateTitle: args.template.title,
    sourceTemplateCategory: args.template.category,
    sourceCriterionExternalId: criterionSnapshot.externalId,
    sourceCriterionNameSnapshot: criterionSnapshot.name,
    sourceCriterionPromptSnapshot: criterionSnapshot.prompt,
    title: rankingTitle,
    description: rankingDescription,
    visibility: 'public',
    publicationState: 'unpublished',
    isPubliclyListable: false,
    supersededAt: null,
    supersededByRankingId: null,
    itemCount: args.rankedItems.length,
    tierCount: tierEntries.length,
    remixCount: 0,
    viewCount,
    topScore: rankingTopScore({ viewCount, remixCount: 0 }),
    isFeatured: false,
    featuredRank: args.featuredRank,
    featuredBadge: args.featuredBadge,
    seedDatasetKey: args.datasetKey,
    seedReleaseId: args.releaseId,
    seedExternalId: args.seedExternalId,
    seedKind: args.seedKind,
    seedTemplateExternalId: args.templateExternalId,
    seedCriterionExternalId: criterionSnapshot.externalId,
    seedAuthorKey: args.authorKey,
    seedProfileKey: args.seedProfileKey,
    seedCuratedExternalId: args.seedCuratedExternalId,
    seedReleaseStatus: 'applied_hidden',
    seedContentHash: contentHash,
    createdAt: args.createdAt,
    updatedAt: now,
  })

  await Promise.all([
    ...tierEntries.map((tier) =>
      ctx.db.insert('publishedRankingTiers', {
        rankingId,
        externalId: tier.externalId,
        name: tier.name,
        description: tier.description,
        colorSpec: tier.colorSpec,
        rowColorSpec: tier.rowColorSpec,
        order: tier.order,
      })
    ),
    ...args.rankedItems.map((ranked) =>
    {
      const tier = tierEntries[ranked.tierIndex]
      return ctx.db.insert('publishedRankingItems', {
        rankingId,
        templateItemId: ranked.item._id,
        templateItemExternalId: ranked.item.externalId,
        externalId: ranked.item.externalId,
        tierExternalId: tier.externalId,
        label: ranked.item.label,
        backgroundColor: ranked.item.backgroundColor,
        mediaPlate: ranked.item.mediaPlate ?? null,
        altText: ranked.item.altText,
        mediaAssetId: ranked.item.mediaAssetId,
        aspectRatio: ranked.item.aspectRatio,
        imageFit: ranked.item.imageFit,
        transform: ranked.item.transform,
        imagePadding: ranked.item.imagePadding,
        order: ranked.globalOrder,
      })
    }),
  ])

  return {
    rankingsDeleted: replacement.rankingsDeleted,
    boardsDeleted: replacement.boardsDeleted,
    rankingsUnchanged: replacement.rankingsUnchanged,
    tiersWritten: tierEntries.length,
    itemsWritten: args.rankedItems.length,
  }
}

interface ResolvedTaskInsertArgs
{
  authorKey: string
  authorEmail: string
  title: string
  description: string
  seedExternalId: string
  boardExternalId: string
  seedKind: NonNullable<Doc<'publishedRankings'>['seedKind']>
  seedProfileKey: string | null
  seedCuratedExternalId: string | null
  rankedItems: RankedSeedItem[]
  tiers: readonly TierPresetTier[]
  featuredRank: number | null
  featuredBadge: RankingFeaturedBadge | null
  createdAtOffsetMs: number
  viewCountSeedKey: string
}

const resolveSampleTaskArgs = (
  target: SeedRankingTarget,
  lane: SeedRankingLane,
  profile: SeedRankingProfile,
  template: Doc<'templates'>,
  items: readonly Doc<'templateItems'>[]
): ResolvedTaskInsertArgs =>
{
  const tiers = resolveTemplateTiers(template)
  assertCountRange(
    'template tiers',
    tiers.length,
    1,
    SEED_LIMITS.rankingSeedTiersPerRanking
  )
  const rankedItems = rankTemplateItemsWithScore(items, tiers, (item) =>
    scoreLaneItem(target.templateExternalId, lane, profile, item)
  )
  const featured = featuredForProfile(lane, profile.key)
  const seedExternalId = formatRankingSeedId({
    templateExternalId: target.templateExternalId,
    criterionExternalId: lane.criterionExternalId,
    kind: 'sample',
    stableKey: profile.key,
  })
  return {
    authorKey: profile.key,
    authorEmail: sampleAuthorEmail(profile.key),
    title: `${profile.displayName}'s ${lane.titleSuffix}`,
    description: lane.description || SAMPLE_RANKING_DESCRIPTION,
    seedExternalId,
    boardExternalId: formatBoardSeedId({
      templateExternalId: target.templateExternalId,
      criterionExternalId: lane.criterionExternalId,
      kind: 'sample',
      stableKey: profile.key,
    }),
    seedKind: 'sample',
    seedProfileKey: profile.key,
    seedCuratedExternalId: null,
    rankedItems,
    tiers,
    featuredRank: featured?.featuredRank ?? null,
    featuredBadge: featured?.featuredBadge ?? null,
    createdAtOffsetMs: 60 * 60 * 1000,
    viewCountSeedKey: `views:${profile.key}:${target.templateExternalId}:${lane.criterionExternalId}`,
  }
}

const resolveCuratedTaskArgs = (
  target: SeedRankingTarget,
  curated: SeedCuratedRanking,
  items: readonly Doc<'templateItems'>[]
): ResolvedTaskInsertArgs =>
{
  const authorKey = curatedSeedAuthorKey(curated.authorKey)
  const seedExternalId = formatRankingSeedId({
    templateExternalId: target.templateExternalId,
    criterionExternalId: curated.criterionExternalId,
    kind: 'curated',
    stableKey: curated.externalId,
  })
  return {
    authorKey,
    authorEmail: curatedAuthorEmail(curated.authorKey),
    title: `${curated.authorDisplayName}'s ${curated.title}`,
    description: curated.description,
    seedExternalId,
    boardExternalId: formatBoardSeedId({
      templateExternalId: target.templateExternalId,
      criterionExternalId: curated.criterionExternalId,
      kind: 'curated',
      stableKey: curated.externalId,
    }),
    seedKind: 'curated',
    seedProfileKey: null,
    seedCuratedExternalId: curated.externalId,
    rankedItems: mapItemsToCuratedTiers(
      curated,
      items,
      `${target.templateExternalId}/${curated.externalId}`
    ),
    tiers: curated.tiers,
    featuredRank: curated.featuredRank,
    featuredBadge: curated.featuredBadge,
    createdAtOffsetMs: 15 * 60 * 1000,
    viewCountSeedKey: `views:${authorKey}:${target.templateExternalId}:${curated.criterionExternalId}`,
  }
}

const serializedApplyTaskValidator = v.union(
  v.object({
    kind: v.literal('sample'),
    criterionExternalId: v.string(),
    profileKey: v.string(),
    sequence: v.number(),
  }),
  v.object({
    kind: v.literal('curated'),
    curatedExternalId: v.string(),
    sequence: v.number(),
  })
)

type SerializedApplyTask =
  | {
      kind: 'sample'
      criterionExternalId: string
      profileKey: string
      sequence: number
    }
  | {
      kind: 'curated'
      curatedExternalId: string
      sequence: number
    }

interface SerializedTemplateTaskGroup
{
  templateExternalId: string
  tasks: SerializedApplyTask[]
}

const serializeApplyTask = (
  task: SeedRankingPlan['tasks'][number]
): SerializedApplyTask =>
  task.kind === 'sample'
    ? {
        kind: 'sample',
        criterionExternalId: task.lane.criterionExternalId,
        profileKey: task.profile.key,
        sequence: task.sequence,
      }
    : {
        kind: 'curated',
        curatedExternalId: task.curated.externalId,
        sequence: task.sequence,
      }

const groupTasksByTemplate = (
  plan: SeedRankingPlan
): SerializedTemplateTaskGroup[] =>
{
  const groups = new Map<string, SerializedApplyTask[]>()
  for (const task of plan.tasks)
  {
    const templateExternalId = task.target.templateExternalId
    const list = groups.get(templateExternalId) ?? []
    list.push(serializeApplyTask(task))
    groups.set(templateExternalId, list)
  }
  return [...groups.entries()].map(([templateExternalId, tasks]) => ({
    templateExternalId,
    tasks,
  }))
}

// Per-template tasks per mutation. Each task writes one ranking plus all of its
// tiers/items, so keep this low enough for local write-rate ceilings.
const SEED_RANKING_TASKS_PER_MUTATION = 4

const chunkTaskGroup = (
  group: SerializedTemplateTaskGroup
): SerializedTemplateTaskGroup[] =>
{
  if (group.tasks.length <= SEED_RANKING_TASKS_PER_MUTATION) return [group]
  const chunks: SerializedTemplateTaskGroup[] = []
  for (
    let i = 0;
    i < group.tasks.length;
    i += SEED_RANKING_TASKS_PER_MUTATION
  )
  {
    chunks.push({
      templateExternalId: group.templateExternalId,
      tasks: group.tasks.slice(i, i + SEED_RANKING_TASKS_PER_MUTATION),
    })
  }
  return chunks
}

const seedTemplateTaskBatchResultValidator = v.object({
  rankingsDeleted: v.number(),
  boardsDeleted: v.number(),
  rankingsUnchanged: v.number(),
  tiersWritten: v.number(),
  itemsWritten: v.number(),
  sampleRankingsApplied: v.number(),
  curatedRankingsApplied: v.number(),
})

type SeedTemplateTaskBatchResult = {
  rankingsDeleted: number
  boardsDeleted: number
  rankingsUnchanged: number
  tiersWritten: number
  itemsWritten: number
  sampleRankingsApplied: number
  curatedRankingsApplied: number
}

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
      let resolved: ResolvedTaskInsertArgs
      let criterionExternalId: string
      if (task.kind === 'sample')
      {
        const lane = target.lanes.find(
          (entry) => entry.criterionExternalId === task.criterionExternalId
        )
        const profile = args.rankingSeeds.profiles.find(
          (entry) => entry.key === task.profileKey
        )
        if (!lane || !profile)
        {
          throw new ConvexError({
            code: CONVEX_ERROR_CODES.invalidState,
            message: `apply task references unknown sample lane/profile: ${args.templateExternalId}:${task.criterionExternalId}:${task.profileKey}`,
          })
        }
        resolved = resolveSampleTaskArgs(target, lane, profile, template, items)
        criterionExternalId = lane.criterionExternalId
        totals.sampleRankingsApplied += 1
      }
      else
      {
        const curated = (target.curatedRankings ?? []).find(
          (entry) => entry.externalId === task.curatedExternalId
        )
        if (!curated)
        {
          throw new ConvexError({
            code: CONVEX_ERROR_CODES.invalidState,
            message: `apply task references unknown curated ranking: ${args.templateExternalId}:${task.curatedExternalId}`,
          })
        }
        resolved = resolveCuratedTaskArgs(target, curated, items)
        criterionExternalId = curated.criterionExternalId
        totals.curatedRankingsApplied += 1
      }
      const inserted = await insertSeedRanking(ctx, {
        datasetKey: args.datasetKey,
        releaseId: args.releaseId,
        templateExternalId: args.templateExternalId,
        criterionExternalId,
        template,
        createdAt:
          Date.now() - Math.max(1, task.sequence) * resolved.createdAtOffsetMs,
        ...resolved,
      })
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
      loadExistingSeedRankings(ctx, args.datasetKey, args.releaseId),
      loadExistingSeedRankings(ctx, args.datasetKey, args.releaseId, true),
    ])
  const existingSeedRankings = existingSeedRankingRows.length
  const existingActiveSeedRankings = existingActiveSeedRankingRows.length
  if (
    args.verifyAppliedRows &&
    existingSeedRankings !==
      plan.sampleRankingsPlanned + plan.curatedRankingsPlanned
  )
  {
    diagnostics.push(
      seedErrorDiagnostic(
        'seedRankingCountMismatch',
        '$.rankingSeeds',
        `expected ${plan.sampleRankingsPlanned + plan.curatedRankingsPlanned} seed rankings, found ${existingSeedRankings}`
      )
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
    internal.marketplace.rankings.seed.actions
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
            internal.marketplace.rankings.seed.actions
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
      internal.marketplace.rankings.seed.actions.preflightSeedRankings,
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

// silence "imported but unused" warnings while we keep the kind type publicly
// scoped to the apply-task contract
export type { SeedRankingKind, Id }
