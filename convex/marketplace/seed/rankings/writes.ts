// convex/marketplace/seed/rankings/writes.ts
// seed ranking row write helpers

import { ConvexError } from 'convex/values'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import type { RankingFeaturedBadge } from '@tierlistbuilder/contracts/marketplace/ranking'
import type { TierPresetTier } from '@tierlistbuilder/contracts/workspace/tierPreset'
import { assertCountRange } from '../../../lib/assertions'
import { SEED_LIMITS } from '../../../lib/limits'
import { seedContentHash } from '../../../lib/seedContentHash'
import {
  resolveActiveTemplateCriterion,
  toTemplateCriterionSnapshot,
} from '../../templates/criteria'
import {
  allocateRankingSlug,
  normalizeRankingDescription,
  normalizeRankingTitle,
  pickRankingRenderFieldsForWrite,
  rankingTopScore,
} from '../../rankings/lib'
import {
  deleteSeedBoardWithChildren,
  deleteSeedRankingWithChildren,
} from './cleanup'
import { formatTierSeedId, isSeedRankingAuthorEmail } from './naming'
import { seedUnitHash, type RankedSeedItem } from './scoring'
import { findSeedRowByExternalId, hasFeaturedSlot } from './rows'

interface ReplacementResult
{
  rankingSlug: string | null
  rankingsDeleted: number
  boardsDeleted: number
  rankingsUnchanged: number
  skipped: boolean
}

export interface SeedRankingWriteResult
{
  rankingsDeleted: number
  boardsDeleted: number
  rankingsUnchanged: number
  tiersWritten: number
  itemsWritten: number
}

export interface InsertSeedRankingArgs
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

export const requireSeedTemplate = async (
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
      // exhaustiveness guard - new SeedRankingReleaseStatus values must add
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

export const insertSeedRanking = async (
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
        ...pickRankingRenderFieldsForWrite({
          ...ranked.item,
          order: ranked.globalOrder,
        }),
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
