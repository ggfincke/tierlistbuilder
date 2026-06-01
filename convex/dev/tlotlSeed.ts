// convex/dev/tlotlSeed.ts
// dev-only sample published rankings for tlotl profile-showcase testing

import { ConvexError, v } from 'convex/values'
import { internalMutation, type MutationCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import {
  DEFAULT_SHOWCASE_TIERS,
  MAX_SHOWCASE_PLACED_ITEMS,
} from '@tierlistbuilder/contracts/platform/showcase'
import {
  BUILTIN_PRESETS,
  type TierPresetTier,
} from '@tierlistbuilder/contracts/workspace/tierPreset'
import { rankingTopScore } from '../marketplace/rankings/lib'
import { resolveActiveTemplateCriterion } from '../marketplace/templates/criteria'
import { toTemplateCriterionSnapshot } from '../marketplace/templates/criteria'
import { loadTemplateItems } from '../marketplace/templates/lib/projections'
import {
  isPublishedTemplateRow,
  isPublicTemplateRow,
} from '../marketplace/templates/lib/state'
import {
  generateBoardId,
  generateItemId,
  generateTierId,
} from '@tierlistbuilder/contracts/lib/ids'
import {
  normalizeBoardTitle,
  pickCoverRenderFields,
} from '@tierlistbuilder/contracts/workspace/board'
import { buildForkedBoardInsert } from '../workspace/boards/cloudFields'
import {
  buildBoardLibrarySummary,
  type BoardLibrarySummaryItem,
  type BoardLibrarySummaryTier,
} from '../workspace/boards/librarySummary'
import { loadTileStorageId } from '../lib/mediaVariants'
import { resolveTemplateProgressState } from '../lib/templateProgress'
import { publishRankingCore } from '../marketplace/rankings/public/mutations'
import {
  deleteSeedBoardWithChildren,
  deleteSeedRankingWithChildren,
} from '../marketplace/rankings/seed/cleanup'
import { deleteShowcaseWithChildren } from '../platform/showcase/internal'
import { requireDevSampleSeedAuthorized } from './seedGate'

const TARGET_EMAIL = 'tterrag456@gmail.com'
const DATASET_KEY = 'dev-tlotl-samples'
const RELEASE_ID = '2026-05-25-tlotl-samples'
const SEED_PROFILE_KEY = 'tterrag456-tlotl'
const DEFAULT_COUNT = 10
const MAX_COUNT = 16
const TEMPLATE_SCAN_LIMIT = 96
const MIN_TEMPLATE_ITEMS = 6
// seeded per ranking; high enough that the top-weighted spread fills the
// showcase's top tiers (still capped by the template's own item count)
const MAX_ITEMS_PER_RANKING = 36
const SAMPLE_CLEANUP_LIMIT = 128
const SEED_STATUSES = ['active', 'applied_hidden', 'rolled_back'] as const

// public identity stamped on the target user so /u/<handle> renders a complete
// demo profile. handle mirrors the email local part (the username in the UI)
const SEED_PROFILE = {
  handle: 'tterrag456',
  displayName: 'Terra',
  pronouns: 'he/him',
  location: 'Pittsburgh',
  bio: 'Hi!',
} as const

interface SeedTier
{
  externalId: string
  name: string
  description: string | null
  colorSpec: TierPresetTier['colorSpec']
  rowColorSpec: TierPresetTier['colorSpec'] | null
  order: number
}

interface SeedCandidate
{
  template: Doc<'templates'>
  criterionExternalId: string
  criterionName: string
  criterionPrompt: string
  items: Doc<'templateItems'>[]
}

interface SeededRankingSummary
{
  slug: string
  boardExternalId: string
  title: string
  templateSlug: string
  templateTitle: string
  criterionExternalId: string
  itemCount: number
  tierCount: number
}

const normalizeCount = (raw: number | undefined): number =>
{
  if (raw === undefined) return DEFAULT_COUNT
  if (!Number.isFinite(raw)) return DEFAULT_COUNT
  return Math.max(1, Math.min(MAX_COUNT, Math.floor(raw)))
}

const normalizeTargetEmail = (raw: string | undefined): string =>
{
  const email = (raw ?? TARGET_EMAIL).trim().toLowerCase()
  if (email !== TARGET_EMAIL)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.forbidden,
      message: `tlotl sample seed is scoped to ${TARGET_EMAIL}`,
    })
  }
  return email
}

const requireSampleSeedAuthorized = (): void =>
  requireDevSampleSeedAuthorized('tlotl sample seed')

const findUserByEmail = async (
  ctx: MutationCtx,
  email: string
): Promise<Doc<'users'>> =>
{
  const user = await ctx.db
    .query('users')
    .withIndex('email', (q) => q.eq('email', email))
    .unique()
  if (!user)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.notFound,
      message: `user not found for ${email}`,
    })
  }
  return user
}

const loadSampleRankings = async (
  ctx: MutationCtx,
  ownerId: Id<'users'>
): Promise<Doc<'publishedRankings'>[]> =>
{
  const rows: Doc<'publishedRankings'>[] = []
  for (const status of SEED_STATUSES)
  {
    const statusRows = await ctx.db
      .query('publishedRankings')
      .withIndex('bySeedDatasetStatusReleaseId', (q) =>
        q
          .eq('seedDatasetKey', DATASET_KEY)
          .eq('seedReleaseStatus', status)
          .eq('seedReleaseId', RELEASE_ID)
      )
      .take(SAMPLE_CLEANUP_LIMIT)
    rows.push(...statusRows.filter((row) => row.ownerId === ownerId))
  }
  return rows
}

const deleteRankingTree = async (
  ctx: MutationCtx,
  ranking: Doc<'publishedRankings'>
): Promise<void> => await deleteSeedRankingWithChildren(ctx, ranking)

// sample boards carry the dataset/release markers; the prefix range over the
// (seedDatasetKey, seedReleaseId) index finds them regardless of seedExternalId,
// so cleanup is robust even if a prior run failed before publishing
const loadSampleBoards = async (
  ctx: MutationCtx,
  ownerId: Id<'users'>
): Promise<Doc<'boards'>[]> =>
{
  const rows = await ctx.db
    .query('boards')
    .withIndex('bySeedDatasetReleaseAndExternalId', (q) =>
      q.eq('seedDatasetKey', DATASET_KEY).eq('seedReleaseId', RELEASE_ID)
    )
    .take(SAMPLE_CLEANUP_LIMIT)
  return rows.filter(
    (row) => row.ownerId === ownerId && row.seedKind === 'ranking-sample'
  )
}

const deleteBoardTree = async (
  ctx: MutationCtx,
  board: Doc<'boards'>
): Promise<void> => await deleteSeedBoardWithChildren(ctx, board)

// re-runs purge the prior dataset's rankings & the boards that back them.
// rankings first, then boards (both vanish in this one mutation regardless, so
// a transiently-dangling livePublicRankingId is never observed)
const deleteExistingSamples = async (
  ctx: MutationCtx,
  ownerId: Id<'users'>
): Promise<{ rankings: number; boards: number }> =>
{
  const rankings = await loadSampleRankings(ctx, ownerId)
  for (const row of rankings)
  {
    await deleteRankingTree(ctx, row)
  }
  const boards = await loadSampleBoards(ctx, ownerId)
  for (const board of boards)
  {
    await deleteBoardTree(ctx, board)
  }
  return { rankings: rankings.length, boards: boards.length }
}

const tierId = (sampleIndex: number, order: number): string =>
  `tier-tlotl-${sampleIndex}-${order}`

// cycle each sample through a different built-in preset so the mini covers
// render varied tier counts & colors (3-tier custom, 10-tier, 5-tier, etc.)
const resolveSeedTiers = (sampleIndex: number): SeedTier[] =>
{
  const preset = BUILTIN_PRESETS[sampleIndex % BUILTIN_PRESETS.length]
  return preset.tiers.map((tier, order) => ({
    externalId: tierId(sampleIndex, order),
    name: tier.name,
    description: tier.description ?? null,
    colorSpec: tier.colorSpec,
    rowColorSpec: tier.rowColorSpec ?? null,
    order,
  }))
}

const hasBlockingRankingForLane = async (
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  templateId: Id<'templates'>,
  criterionExternalId: string
): Promise<boolean> =>
{
  const rows = await ctx.db
    .query('publishedRankings')
    .withIndex('bySourceTemplateCriterionOwnerPublicationStateUpdatedAt', (q) =>
      q
        .eq('sourceTemplateId', templateId)
        .eq('sourceCriterionExternalId', criterionExternalId)
        .eq('ownerId', ownerId)
        .eq('publicationState', 'published')
    )
    .order('desc')
    .take(8)
  return rows.some(
    (row) =>
      row.seedDatasetKey !== DATASET_KEY || row.seedReleaseId !== RELEASE_ID
  )
}

const loadCandidates = async (
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  count: number
): Promise<SeedCandidate[]> =>
{
  const cards = await ctx.db
    .query('templateCards')
    .withIndex('byIsPubliclyListableUpdatedAt', (q) =>
      q.eq('isPubliclyListable', true)
    )
    .order('desc')
    .take(TEMPLATE_SCAN_LIMIT)
  const candidates: SeedCandidate[] = []
  const seenTemplates = new Set<Id<'templates'>>()

  for (const card of cards)
  {
    if (candidates.length >= count) break
    if (seenTemplates.has(card.templateId)) continue
    seenTemplates.add(card.templateId)

    const template = await ctx.db.get(card.templateId)
    if (
      !template ||
      !isPublishedTemplateRow(template) ||
      !isPublicTemplateRow(template)
    )
    {
      continue
    }

    const criterion = resolveActiveTemplateCriterion(template)
    const criterionSnapshot = toTemplateCriterionSnapshot(criterion)
    if (
      await hasBlockingRankingForLane(
        ctx,
        ownerId,
        template._id,
        criterionSnapshot.externalId
      )
    )
    {
      continue
    }

    const items = await loadTemplateItems(ctx, template._id)
    if (items.length < MIN_TEMPLATE_ITEMS) continue

    candidates.push({
      template,
      criterionExternalId: criterionSnapshot.externalId,
      criterionName: criterionSnapshot.name,
      criterionPrompt: criterionSnapshot.prompt,
      items,
    })
  }

  if (candidates.length === 0)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message:
        'no public templates with enough items were available for tlotl samples',
    })
  }

  return candidates
}

const sampleItems = (
  items: Doc<'templateItems'>[],
  sampleIndex: number
): Doc<'templateItems'>[] =>
{
  const ordered = [...items].sort((a, b) => a.order - b.order)
  const rotated = ordered
    .slice(sampleIndex % ordered.length)
    .concat(ordered.slice(0, sampleIndex % ordered.length))
  return rotated.slice(0, Math.min(MAX_ITEMS_PER_RANKING, rotated.length))
}

// gentle top-lean tier assignment: weight upper tiers fuller (2*n-k vs the old
// steep n-k) so lower visible cover rows fill instead of flattening to empty
// bands; still top-leaning so top tiers read densest (slightly lowers profile top-4)
const tierIndexForItem = (
  itemIndex: number,
  itemCount: number,
  tierCount: number
): number =>
{
  const weights = Array.from({ length: tierCount }, (_, k) => 2 * tierCount - k)
  const weightSum = weights.reduce((sum, w) => sum + w, 0)
  const frac = (itemIndex + 0.5) / itemCount
  let acc = 0
  for (let k = 0; k < tierCount; k += 1)
  {
    acc += weights[k] / weightSum
    if (frac <= acc) return k
  }
  return tierCount - 1
}

interface InsertedSeedTier
{
  id: Id<'boardTiers'>
  externalId: string
  order: number
  colorSpec: SeedTier['colorSpec']
}

// materialize a real, fully-ranked board from the candidate template, then
// publish it via the canonical core so it reads as "Live" in My Boards. autoCrop
// still patches the published ranking items post-seed (board items stay default)
const materializeAndPublishSample = async (
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  candidate: SeedCandidate,
  sampleIndex: number
): Promise<{ summary: SeededRankingSummary; boardId: Id<'boards'> }> =>
{
  const now = Date.now()
  // stagger board & ranking timestamps so samples sort newest-first by index in
  // both My Boards (board.updatedAt) & the showcase lanes (ranking.updatedAt)
  const stamp = now - (sampleIndex + 1) * 60_000
  const template = candidate.template
  const seedTiers = resolveSeedTiers(sampleIndex)
  const items = sampleItems(candidate.items, sampleIndex)
  const seedExternalId = `tlotl:${template.slug}:${candidate.criterionExternalId}`
  const seedContentHash = `${DATASET_KEY}:${RELEASE_ID}:${template._id}:${candidate.criterionExternalId}`

  // 1. board row — fully ranked (unrankedItemCount 0) so publish accepts it
  const boardExternalId = generateBoardId()
  const boardId = await ctx.db.insert('boards', {
    externalId: boardExternalId,
    ownerId,
    preferredCriterionExternalId: candidate.criterionExternalId,
    ...buildForkedBoardInsert(template, {
      title: normalizeBoardTitle(`${template.title} - sample`),
      forkCounted: false,
      itemCount: items.length,
      now: stamp,
    }),
    activeItemCount: items.length,
    unrankedItemCount: 0,
    templateProgressState: resolveTemplateProgressState(template._id, {
      activeItemCount: items.length,
      unrankedItemCount: 0,
    }),
    seedDatasetKey: DATASET_KEY,
    seedReleaseId: RELEASE_ID,
    seedExternalId,
    seedContentHash,
    seedKind: 'ranking-sample',
    seedReleaseStatus: 'active',
  })

  // 2. board tiers (fresh ids) + tier-placed board items
  const insertedTiers: InsertedSeedTier[] = await Promise.all(
    seedTiers.map(async (tier) =>
    {
      const externalId = generateTierId()
      const id = await ctx.db.insert('boardTiers', {
        boardId,
        externalId,
        name: tier.name,
        ...(tier.description !== null ? { description: tier.description } : {}),
        colorSpec: tier.colorSpec,
        ...(tier.rowColorSpec !== null
          ? { rowColorSpec: tier.rowColorSpec }
          : {}),
        order: tier.order,
      })
      return { id, externalId, order: tier.order, colorSpec: tier.colorSpec }
    })
  )

  const summaryItems: BoardLibrarySummaryItem[] = await Promise.all(
    items.map(async (item, order) =>
    {
      const tier =
        insertedTiers[
          tierIndexForItem(order, items.length, insertedTiers.length)
        ]
      const externalId = generateItemId()
      const storageId = item.mediaAssetId
        ? await loadTileStorageId(ctx, item.mediaAssetId)
        : null
      await ctx.db.insert('boardItems', {
        boardId,
        tierId: tier.id,
        externalId,
        label: item.label ?? undefined,
        backgroundColor: item.backgroundColor ?? undefined,
        mediaPlate: item.mediaPlate ?? undefined,
        altText: item.altText ?? undefined,
        mediaAssetId: item.mediaAssetId,
        order,
        deletedAt: null,
        aspectRatio: item.aspectRatio ?? undefined,
        imageFit: item.imageFit ?? undefined,
        transform: item.transform ?? undefined,
        imagePadding: item.imagePadding ?? undefined,
        templateItemId: item._id,
      })
      return {
        tierKey: tier.externalId,
        externalId,
        label: item.label,
        storageId,
        order,
        deletedAt: null,
        ...pickCoverRenderFields(item),
      }
    })
  )

  // 3. denormalized library summary so the My Boards card renders a cover
  const summaryTiers: BoardLibrarySummaryTier[] = insertedTiers.map((tier) => ({
    key: tier.externalId,
    order: tier.order,
    colorSpec: tier.colorSpec,
  }))
  await ctx.db.patch(boardId, {
    librarySummary: buildBoardLibrarySummary({
      tiers: summaryTiers,
      items: summaryItems,
    }),
  })

  // 4. publish via the canonical core (skip the aggregate fan-out per sample),
  // then stamp seed identity + demo view stats the auth path leaves at zero &
  // restore the staggered timestamps (core bumps board.updatedAt to its now)
  const board = await ctx.db.get(boardId)
  if (!board)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: 'seed board vanished before publish',
    })
  }
  // each sample publishes a fresh board (livePublicRankingId starts null), so
  // the board-scoped retire is a no-op; skip the aggregate fan-out per sample
  const { slug, rankingId } = await publishRankingCore(ctx, board, {
    visibility: 'public',
    criterionExternalId: candidate.criterionExternalId,
    queueAggregate: false,
  })

  const viewCount = 20 + sampleIndex * 7
  await ctx.db.patch(rankingId, {
    viewCount,
    topScore: rankingTopScore({ viewCount, remixCount: 0 }),
    createdAt: stamp,
    updatedAt: stamp,
    seedDatasetKey: DATASET_KEY,
    seedReleaseId: RELEASE_ID,
    seedExternalId,
    seedKind: 'sample',
    seedTemplateExternalId: template.seedExternalId ?? template.slug,
    seedCriterionExternalId: candidate.criterionExternalId,
    seedAuthorKey: TARGET_EMAIL,
    seedProfileKey: SEED_PROFILE_KEY,
    seedCuratedExternalId: null,
    seedReleaseStatus: 'active',
    seedContentHash,
  })
  await ctx.db.patch(boardId, { updatedAt: stamp })

  return {
    summary: {
      slug,
      boardExternalId,
      title: board.title,
      templateSlug: template.slug,
      templateTitle: template.title,
      criterionExternalId: candidate.criterionExternalId,
      itemCount: items.length,
      tierCount: insertedTiers.length,
    },
    boardId,
  }
}

// stamp the target user's public identity. handle is skipped (not cleared) if
// another user already holds it so the byHandle unique read can't break
const seedTargetProfile = async (
  ctx: MutationCtx,
  user: Doc<'users'>
): Promise<boolean> =>
{
  const existing = await ctx.db
    .query('users')
    .withIndex('byHandle', (q) => q.eq('handle', SEED_PROFILE.handle))
    .unique()
  const handleAvailable = !existing || existing._id === user._id
  await ctx.db.patch(user._id, {
    displayName: SEED_PROFILE.displayName,
    pronouns: SEED_PROFILE.pronouns,
    location: SEED_PROFILE.location,
    bio: SEED_PROFILE.bio,
    ...(handleAvailable ? { handle: SEED_PROFILE.handle } : {}),
    updatedAt: Date.now(),
  })
  return handleAvailable
}

// wipe the user's existing showcase + tiers + placements so re-runs start clean
const wipeShowcase = async (
  ctx: MutationCtx,
  ownerId: Id<'users'>
): Promise<void> =>
{
  const showcase = await ctx.db
    .query('profileShowcases')
    .withIndex('byOwner', (q) => q.eq('ownerId', ownerId))
    .unique()
  if (!showcase) return
  await deleteShowcaseWithChildren(ctx, showcase._id)
}

// fresh showcase w/ default S-E tiers & every seeded ranking placed via the
// top-weighted spread - so /u/<handle> renders populated tlotl tiers right away
const seedShowcasePlacements = async (
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  placedBoardIds: Id<'boards'>[]
): Promise<number> =>
{
  await wipeShowcase(ctx, ownerId)
  if (placedBoardIds.length === 0) return 0
  const now = Date.now()
  const showcaseId = await ctx.db.insert('profileShowcases', {
    ownerId,
    createdAt: now,
    updatedAt: now,
  })
  for (const tier of DEFAULT_SHOWCASE_TIERS)
  {
    await ctx.db.insert('profileShowcaseTiers', {
      showcaseId,
      externalId: tier.externalId,
      name: tier.name,
      ...(tier.description !== null ? { description: tier.description } : {}),
      colorSpec: tier.colorSpec,
      ...(tier.rowColorSpec !== null
        ? { rowColorSpec: tier.rowColorSpec }
        : {}),
      order: tier.order,
    })
  }
  const tierCount = DEFAULT_SHOWCASE_TIERS.length
  const seen = new Set<Id<'boards'>>()
  let placed = 0
  for (const [index, boardId] of placedBoardIds.entries())
  {
    if (placed >= MAX_SHOWCASE_PLACED_ITEMS) break
    if (seen.has(boardId)) continue
    seen.add(boardId)
    const tierIdx = tierIndexForItem(index, placedBoardIds.length, tierCount)
    await ctx.db.insert('profileShowcaseItems', {
      showcaseId,
      tierExternalId: DEFAULT_SHOWCASE_TIERS[tierIdx].externalId,
      boardId,
      order: placed,
    })
    placed += 1
  }
  return placed
}

export const seedSamplePublishedRankingsForUser = internalMutation({
  args: {
    email: v.optional(v.string()),
    count: v.optional(v.number()),
  },
  returns: v.object({
    targetEmail: v.string(),
    userId: v.string(),
    requestedCount: v.number(),
    inserted: v.number(),
    deletedExistingSamples: v.number(),
    deletedExistingBoards: v.number(),
    candidatesFound: v.number(),
    placementsCreated: v.number(),
    handleAssigned: v.boolean(),
    rankings: v.array(
      v.object({
        slug: v.string(),
        boardExternalId: v.string(),
        title: v.string(),
        templateSlug: v.string(),
        templateTitle: v.string(),
        criterionExternalId: v.string(),
        itemCount: v.number(),
        tierCount: v.number(),
      })
    ),
  }),
  handler: async (ctx, args) =>
  {
    requireSampleSeedAuthorized()
    const targetEmail = normalizeTargetEmail(args.email)
    const requestedCount = normalizeCount(args.count)
    const user = await findUserByEmail(ctx, targetEmail)
    const handleAssigned = await seedTargetProfile(ctx, user)
    // always purge the prior dataset first so the seed is idempotent — re-runs
    // can't leave duplicate rankings/boards behind (each sample is a fresh board)
    const deleted = await deleteExistingSamples(ctx, user._id)
    const candidates = await loadCandidates(ctx, user._id, requestedCount)
    const rankings: SeededRankingSummary[] = []
    const placedBoardIds: Id<'boards'>[] = []

    for (const [index, candidate] of candidates.entries())
    {
      if (rankings.length >= requestedCount) break
      const { summary, boardId } = await materializeAndPublishSample(
        ctx,
        user._id,
        candidate,
        index
      )
      rankings.push(summary)
      placedBoardIds.push(boardId)
    }

    const placementsCreated = await seedShowcasePlacements(
      ctx,
      user._id,
      placedBoardIds
    )

    return {
      targetEmail,
      userId: user._id,
      requestedCount,
      inserted: rankings.length,
      deletedExistingSamples: deleted.rankings,
      deletedExistingBoards: deleted.boards,
      candidatesFound: candidates.length,
      placementsCreated,
      handleAssigned,
      rankings,
    }
  },
})
