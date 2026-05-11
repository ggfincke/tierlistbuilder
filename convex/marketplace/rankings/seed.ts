// convex/marketplace/rankings/seed.ts
// seed-gated writer for release-owned marketplace ranking snapshots

import { ConvexError, v } from 'convex/values'
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from '../../_generated/server'
import { internal } from '../../_generated/api'
import type { Doc, Id } from '../../_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import type { RankingFeaturedBadge } from '@tierlistbuilder/contracts/marketplace/ranking'
import type { TierPresetTier } from '@tierlistbuilder/contracts/workspace/tierPreset'
import { normalizeBoardTitle } from '@tierlistbuilder/contracts/workspace/board'
import { assertCountRange, assertNonemptyString } from '../../lib/assertions'
import { SEED_LIMITS } from '../../lib/limits'
import { loadMediaVariantStorageId } from '../../lib/mediaVariants'
import { resolveTemplateProgressState } from '../../lib/templateProgress'
import { buildFreshBoardCloudFields } from '../../workspace/boards/cloudFields'
import {
  buildBoardLibrarySummary,
  EMPTY_BOARD_LIBRARY_SUMMARY,
  type BoardLibrarySummaryItem,
  type BoardLibrarySummaryTier,
} from '../../workspace/boards/librarySummary'
import { loadSeedTemplateLookupForRelease } from '../seedPipeline/templates'
import { resolveActiveTemplateCriterion } from '../templates/criteria'
import {
  DEFAULT_TEMPLATE_TIERS,
  loadTemplateItems,
  validateTemplateTiers,
} from '../templates/lib'
import {
  allocateRankingSlug,
  normalizeRankingDescription,
  normalizeRankingTitle,
  rankingTopScore,
} from './lib'
import {
  seedCuratedRankingValidator,
  seedRankingApplyResultValidator,
  seedRankingLaneValidator,
  seedRankingPreflightResultValidator,
  seedRankingProfileValidator,
  seedRankingTargetValidator,
  seedRankingsManifestValidator,
  type SeedCuratedRanking,
  type SeedRankingApplyResult,
  type SeedRankingDiagnostic,
  type SeedRankingLane,
  type SeedRankingLaneSummary,
  type SeedRankingPreflightResult,
  type SeedRankingProfile,
  type SeedRankingTarget,
  type SeedRankingsManifest,
} from './seedValidators'

const SEED_EMAIL_DOMAIN = 'tierlistbuilder.local'
const SEED_AUTHOR_PREFIX = 'seed+rankings-'
const SAMPLE_RANKING_DESCRIPTION =
  'Seeded sample ranking for community feature testing.'

interface RankedSeedItem
{
  item: Doc<'templateItems'>
  tierIndex: number
  orderInTier: number
  globalOrder: number
}

interface SeedAuthorRequest
{
  key: string
  email: string
  displayName: string
}

interface ReplacementResult
{
  rankingSlug: string | null
  rankingsDeleted: number
  boardsDeleted: number
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

const diagnostic = (
  severity: SeedRankingDiagnostic['severity'],
  code: string,
  path: string,
  message: string
): SeedRankingDiagnostic => ({ severity, code, path, message })

const errorDiagnostic = (
  code: string,
  path: string,
  message: string
): SeedRankingDiagnostic => diagnostic('error', code, path, message)

const warningDiagnostic = (
  code: string,
  path: string,
  message: string
): SeedRankingDiagnostic => diagnostic('warning', code, path, message)

const canonicalAuthorKey = (authorKey: string): string =>
  authorKey.trim().toLowerCase()

const sampleAuthorEmail = (profileKey: string): string =>
  `${SEED_AUTHOR_PREFIX}${canonicalAuthorKey(profileKey)}@${SEED_EMAIL_DOMAIN}`

const curatedSeedAuthorKey = (authorKey: string): string =>
  `curated-${canonicalAuthorKey(authorKey)}`

const curatedAuthorEmail = (curated: SeedCuratedRanking): string =>
  sampleAuthorEmail(curatedSeedAuthorKey(curated.authorKey))

const isSeedRankingEmail = (email: string): boolean =>
  email.endsWith(`@${SEED_EMAIL_DOMAIN}`) &&
  email.startsWith(SEED_AUTHOR_PREFIX)

const rankingSeedExternalId = (
  templateExternalId: string,
  criterionExternalId: string,
  kind: 'sample' | 'curated',
  stableKey: string
): string =>
  `ranking:${templateExternalId}:${criterionExternalId}:${kind}:${stableKey}`

const boardSeedExternalId = (
  templateExternalId: string,
  criterionExternalId: string,
  kind: 'sample' | 'curated',
  stableKey: string
): string =>
  `board:${templateExternalId}:${criterionExternalId}:${kind}:${stableKey}`

const tierSeedExternalId = (seedExternalId: string, order: number): string =>
  `${seedExternalId}:tier:${order.toString().padStart(2, '0')}`

const itemSeedExternalId = (
  seedExternalId: string,
  item: Doc<'templateItems'>
): string => `${seedExternalId}:item:${item.order.toString().padStart(4, '0')}`

const stableHash = (value: string): number =>
{
  let hash = 2166136261
  for (let i = 0; i < value.length; i++)
  {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const unitHash = (value: string): number => stableHash(value) / 0xffffffff

const normalizeTextKey = (value: string): string =>
  value
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/\./g, '')
    .replace(/&/g, ' and ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

const termMatches = (label: string, terms: readonly string[]): number =>
{
  const normalized = normalizeTextKey(label)
  return terms.reduce((sum, term) =>
  {
    const needle = normalizeTextKey(term)
    return needle && normalized.includes(needle) ? sum + 1 : sum
  }, 0)
}

const profileTargetTerms = (
  profile: SeedRankingProfile,
  field: 'boostTermsByTarget' | 'dropTermsByTarget',
  templateExternalId: string
): readonly string[] => profile[field]?.[templateExternalId] ?? []

const laneProfileTerms = (
  lane: SeedRankingLane,
  field: 'profileBoostOverrides' | 'profileDropOverrides',
  profileKey: string
): readonly string[] => lane[field]?.[profileKey] ?? []

const scoreLaneItem = (
  templateExternalId: string,
  lane: SeedRankingLane,
  profile: SeedRankingProfile,
  item: Doc<'templateItems'>
): number =>
{
  const label = item.label ?? item.externalId
  const crowd = unitHash(
    `crowd:${templateExternalId}:${lane.criterionExternalId}:${label}`
  )
  const personal = unitHash(
    `personal:${profile.key}:${templateExternalId}:${lane.criterionExternalId}:${label}`
  )
  const chaos = Math.min(1, profile.chaos * (lane.chaosMultiplier ?? 1))
  const contrarian = Math.min(
    1,
    profile.contrarian * (lane.contrarianMultiplier ?? 1)
  )
  const baseCrowd = crowd * (1 - contrarian)
  const baseContrarian = (1 - crowd) * contrarian
  let score = (baseCrowd + baseContrarian) * (1 - chaos)
  score += personal * chaos
  score += termMatches(label, lane.boostTerms) * 0.18
  score -= termMatches(label, lane.dropTerms) * 0.24
  score +=
    termMatches(
      label,
      profileTargetTerms(profile, 'boostTermsByTarget', templateExternalId)
    ) * 0.25
  score -=
    termMatches(
      label,
      profileTargetTerms(profile, 'dropTermsByTarget', templateExternalId)
    ) * 0.25
  score +=
    termMatches(
      label,
      laneProfileTerms(lane, 'profileBoostOverrides', profile.key)
    ) * 0.5
  score -=
    termMatches(
      label,
      laneProfileTerms(lane, 'profileDropOverrides', profile.key)
    ) * 0.3
  return score
}

const tierWeights = (tierCount: number): number[] =>
{
  if (tierCount === 6) return [0.14, 0.19, 0.22, 0.2, 0.15, 0.1]
  return Array.from({ length: tierCount }, () => 1 / tierCount)
}

const resolveTierQuotas = (itemCount: number, tierCount: number): number[] =>
{
  const weights = tierWeights(tierCount)
  const minQuota = itemCount >= tierCount ? 1 : 0
  const raw = weights.map((weight) => weight * itemCount)
  const quotas = raw.map((quota) => Math.max(minQuota, Math.floor(quota)))
  let sum = quotas.reduce((total, quota) => total + quota, 0)

  for (let i = quotas.length - 1; sum > itemCount && i >= 0; i--)
  {
    while (sum > itemCount && quotas[i] > minQuota)
    {
      quotas[i] -= 1
      sum -= 1
    }
  }

  while (sum < itemCount)
  {
    let bestIndex = 0
    let bestGap = -Infinity
    for (let i = 0; i < quotas.length; i++)
    {
      const gap = raw[i] - quotas[i]
      if (gap > bestGap)
      {
        bestGap = gap
        bestIndex = i
      }
    }
    quotas[bestIndex] += 1
    sum += 1
  }

  return quotas
}

const rankTemplateItemsWithScore = (
  items: readonly Doc<'templateItems'>[],
  tiers: readonly TierPresetTier[],
  scoreItem: (item: Doc<'templateItems'>) => number
): RankedSeedItem[] =>
{
  const scored = items
    .map((item) => ({ item, score: scoreItem(item) }))
    .sort((a, b) => b.score - a.score || a.item.order - b.item.order)
  const quotas = resolveTierQuotas(items.length, tiers.length)
  const ranked: RankedSeedItem[] = []
  let cursor = 0

  for (let tierIndex = 0; tierIndex < quotas.length; tierIndex++)
  {
    for (let orderInTier = 0; orderInTier < quotas[tierIndex]; orderInTier++)
    {
      const entry = scored[cursor]
      if (!entry) break
      ranked.push({
        item: entry.item,
        tierIndex,
        orderInTier,
        globalOrder: ranked.length,
      })
      cursor += 1
    }
  }

  return ranked
}

const resolveTemplateTiers = (
  template: Doc<'templates'>
): readonly TierPresetTier[] =>
  template.suggestedTiers.length > 0
    ? template.suggestedTiers
    : DEFAULT_TEMPLATE_TIERS

const authorRequestsForManifest = (
  manifest: SeedRankingsManifest
): SeedAuthorRequest[] =>
{
  const requests = new Map<string, SeedAuthorRequest>()
  for (const profile of manifest.profiles)
  {
    const email = sampleAuthorEmail(profile.key)
    requests.set(email, {
      key: profile.key,
      email,
      displayName: profile.displayName,
    })
  }
  for (const target of manifest.targets)
  {
    for (const curated of target.curatedRankings ?? [])
    {
      const key = curatedSeedAuthorKey(curated.authorKey)
      const email = curatedAuthorEmail(curated)
      requests.set(email, {
        key,
        email,
        displayName: curated.authorDisplayName,
      })
    }
  }
  return [...requests.values()]
}

const normalizeProfileCount = (
  manifest: SeedRankingsManifest,
  target: SeedRankingTarget
): number =>
{
  const raw = target.sampleProfileCount ?? manifest.defaultProfileCount
  const count = Number.isFinite(raw) ? Math.floor(raw) : 0
  return Math.max(0, Math.min(manifest.profiles.length, count))
}

const plannedLaneSummaries = (
  manifest: SeedRankingsManifest
): SeedRankingLaneSummary[] =>
{
  const byLane = new Map<string, SeedRankingLaneSummary>()
  const ensure = (
    templateExternalId: string,
    criterionExternalId: string
  ): SeedRankingLaneSummary =>
  {
    const key = `${templateExternalId}:${criterionExternalId}`
    const existing = byLane.get(key)
    if (existing) return existing
    const created = {
      templateExternalId,
      criterionExternalId,
      sampleRankings: 0,
      curatedRankings: 0,
    }
    byLane.set(key, created)
    return created
  }
  for (const target of manifest.targets)
  {
    const profileCount = normalizeProfileCount(manifest, target)
    for (const lane of target.lanes)
    {
      ensure(
        target.templateExternalId,
        lane.criterionExternalId
      ).sampleRankings += profileCount
    }
    for (const curated of target.curatedRankings ?? [])
    {
      ensure(
        target.templateExternalId,
        curated.criterionExternalId
      ).curatedRankings += 1
    }
  }
  return [...byLane.values()].sort(
    (a, b) =>
      a.templateExternalId.localeCompare(b.templateExternalId) ||
      a.criterionExternalId.localeCompare(b.criterionExternalId)
  )
}

const countPlannedSampleRankings = (manifest: SeedRankingsManifest): number =>
  manifest.targets.reduce(
    (sum, target) =>
      sum + normalizeProfileCount(manifest, target) * target.lanes.length,
    0
  )

const countPlannedCuratedRankings = (manifest: SeedRankingsManifest): number =>
  manifest.targets.reduce(
    (sum, target) => sum + (target.curatedRankings?.length ?? 0),
    0
  )

const loadExistingSeedRankingCount = async (
  ctx: QueryCtx,
  datasetKey: string,
  releaseId: string
): Promise<number> =>
{
  const rows = await ctx.db
    .query('publishedRankings')
    .withIndex('bySeedDatasetReleaseAndExternalId', (q) =>
      q.eq('seedDatasetKey', datasetKey).eq('seedReleaseId', releaseId)
    )
    .take(SEED_LIMITS.rankingSeedRowsPerRelease + 1)
  if (rows.length > SEED_LIMITS.rankingSeedRowsPerRelease)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: 'seed ranking release exceeds read limit',
    })
  }
  return rows.length
}

const loadExistingActiveSeedRankingCount = async (
  ctx: QueryCtx,
  datasetKey: string,
  releaseId: string
): Promise<number> =>
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
  if (rows.length > SEED_LIMITS.rankingSeedRowsPerRelease)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: 'seed ranking release exceeds read limit',
    })
  }
  return rows.length
}

const buildItemLookupByLabel = (
  items: readonly Doc<'templateItems'>[],
  path: string
): Map<string, Doc<'templateItems'>[]> =>
{
  const map = new Map<string, Doc<'templateItems'>[]>()
  for (const item of items)
  {
    const label = item.label ?? item.externalId
    const key = normalizeTextKey(label)
    const bucket = map.get(key) ?? []
    bucket.push(item)
    map.set(key, bucket)
  }
  for (const [key, bucket] of map)
  {
    if (bucket.length > 1)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: `${path}: duplicate normalized template label '${key}'`,
      })
    }
  }
  return map
}

const requireCuratedItemByLabel = (
  curated: SeedCuratedRanking,
  lookup: ReadonlyMap<string, readonly Doc<'templateItems'>[]>,
  label: string
): Doc<'templateItems'> =>
{
  const matches = lookup.get(normalizeTextKey(label)) ?? []
  if (matches.length === 1) return matches[0]
  throw new ConvexError({
    code: CONVEX_ERROR_CODES.invalidState,
    message: `curated ranking ${curated.externalId}: no template item with label '${label}'`,
  })
}

const mapItemsToCuratedTiers = (
  curated: SeedCuratedRanking,
  items: readonly Doc<'templateItems'>[],
  path = curated.externalId
): RankedSeedItem[] =>
{
  assertCountRange(
    'curated tiers',
    curated.tiers.length,
    1,
    SEED_LIMITS.rankingSeedTiersPerRanking
  )
  validateTemplateTiers(curated.tiers)

  const tiersByName = new Map<string, number>()
  curated.tiers.forEach((tier, index) =>
  {
    const key = normalizeTextKey(tier.name)
    if (!key || tiersByName.has(key))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: `${path}: duplicate or blank curated tier '${tier.name}'`,
      })
    }
    tiersByName.set(key, index)
  })

  const itemLookup = buildItemLookupByLabel(items, path)
  const tierIndexByItemId = new Map<Id<'templateItems'>, number>()
  const labelsByTier = new Map<number, string[]>()
  for (const group of curated.tierGroups)
  {
    const tierIndex = tiersByName.get(normalizeTextKey(group.tierName))
    if (tierIndex === undefined)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: `${path}: unknown curated tier '${group.tierName}'`,
      })
    }
    const list = labelsByTier.get(tierIndex) ?? []
    for (const label of group.labels)
    {
      const item = requireCuratedItemByLabel(curated, itemLookup, label)
      if (tierIndexByItemId.has(item._id))
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.invalidState,
          message: `${path}: template item '${label}' is placed more than once`,
        })
      }
      tierIndexByItemId.set(item._id, tierIndex)
      list.push(label)
    }
    labelsByTier.set(tierIndex, list)
  }

  const skippedItemIds = new Set<Id<'templateItems'>>()
  for (const [childLabel, parentLabel] of Object.entries(
    curated.parentLabelByLabel ?? {}
  ))
  {
    const parent = requireCuratedItemByLabel(curated, itemLookup, parentLabel)
    if (!tierIndexByItemId.has(parent._id))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: `${path}: parent label '${parentLabel}' missing for child '${childLabel}'`,
      })
    }
    skippedItemIds.add(
      requireCuratedItemByLabel(curated, itemLookup, childLabel)._id
    )
  }

  if (curated.coverage === 'full-template')
  {
    for (const item of items)
    {
      if (tierIndexByItemId.has(item._id) || skippedItemIds.has(item._id))
      {
        continue
      }
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: `${path}: template item '${item.label ?? item.externalId}' is not placed`,
      })
    }
  }

  const ranked: RankedSeedItem[] = []
  const tierIndices = [...labelsByTier.keys()].sort((a, b) => a - b)
  for (const tierIndex of tierIndices)
  {
    const labels = labelsByTier.get(tierIndex) ?? []
    let orderInTier = 0
    for (const label of labels)
    {
      const item = requireCuratedItemByLabel(curated, itemLookup, label)
      ranked.push({
        item,
        tierIndex,
        orderInTier: orderInTier++,
        globalOrder: ranked.length,
      })
    }
  }
  return ranked
}

const requireSeedTemplate = async (
  ctx: MutationCtx,
  datasetKey: string,
  releaseId: string,
  templateExternalId: string
): Promise<Doc<'templates'>> =>
{
  const template = await ctx.db
    .query('templates')
    .withIndex('bySeedDatasetReleaseAndExternalId', (q) =>
      q
        .eq('seedDatasetKey', datasetKey)
        .eq('seedReleaseId', releaseId)
        .eq('seedExternalId', templateExternalId)
    )
    .unique()
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
  if (!isSeedRankingEmail(email))
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

const findExistingSeedRanking = async (
  ctx: MutationCtx,
  datasetKey: string,
  releaseId: string,
  seedExternalId: string
): Promise<Doc<'publishedRankings'> | null> =>
  await ctx.db
    .query('publishedRankings')
    .withIndex('bySeedDatasetReleaseAndExternalId', (q) =>
      q
        .eq('seedDatasetKey', datasetKey)
        .eq('seedReleaseId', releaseId)
        .eq('seedExternalId', seedExternalId)
    )
    .unique()

const findExistingSeedBoard = async (
  ctx: MutationCtx,
  datasetKey: string,
  releaseId: string,
  seedExternalId: string
): Promise<Doc<'boards'> | null> =>
  await ctx.db
    .query('boards')
    .withIndex('bySeedDatasetReleaseAndExternalId', (q) =>
      q
        .eq('seedDatasetKey', datasetKey)
        .eq('seedReleaseId', releaseId)
        .eq('seedExternalId', seedExternalId)
    )
    .unique()

const deleteRankingWithChildren = async (
  ctx: MutationCtx,
  ranking: Doc<'publishedRankings'>
): Promise<void> =>
{
  const [items, tiers] = await Promise.all([
    ctx.db
      .query('publishedRankingItems')
      .withIndex('byRanking', (q) => q.eq('rankingId', ranking._id))
      .take(SEED_LIMITS.rankingSeedItemsPerRanking + 1),
    ctx.db
      .query('publishedRankingTiers')
      .withIndex('byRanking', (q) => q.eq('rankingId', ranking._id))
      .take(SEED_LIMITS.rankingSeedTiersPerRanking + 1),
  ])
  if (items.length > SEED_LIMITS.rankingSeedItemsPerRanking)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: 'seed ranking item rows exceed cleanup limit',
    })
  }
  if (tiers.length > SEED_LIMITS.rankingSeedTiersPerRanking)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: 'seed ranking tier rows exceed cleanup limit',
    })
  }
  await Promise.all([
    ...items.map((item) => ctx.db.delete(item._id)),
    ...tiers.map((tier) => ctx.db.delete(tier._id)),
    ctx.db.delete(ranking._id),
  ])
}

const deleteBoardWithChildren = async (
  ctx: MutationCtx,
  board: Doc<'boards'>
): Promise<void> =>
{
  const [items, tiers] = await Promise.all([
    ctx.db
      .query('boardItems')
      .withIndex('byBoardAndTier', (q) => q.eq('boardId', board._id))
      .take(SEED_LIMITS.rankingSeedItemsPerRanking + 1),
    ctx.db
      .query('boardTiers')
      .withIndex('byBoard', (q) => q.eq('boardId', board._id))
      .take(SEED_LIMITS.rankingSeedTiersPerRanking + 1),
  ])
  if (items.length > SEED_LIMITS.rankingSeedItemsPerRanking)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: 'seed board item rows exceed cleanup limit',
    })
  }
  if (tiers.length > SEED_LIMITS.rankingSeedTiersPerRanking)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: 'seed board tier rows exceed cleanup limit',
    })
  }
  await Promise.all([
    ...items.map((item) => ctx.db.delete(item._id)),
    ...tiers.map((tier) => ctx.db.delete(tier._id)),
    ctx.db.delete(board._id),
  ])
}

const replaceExistingSeedRows = async (
  ctx: MutationCtx,
  params: {
    datasetKey: string
    releaseId: string
    rankingSeedExternalId: string
    boardSeedExternalId: string
  }
): Promise<ReplacementResult> =>
{
  const [ranking, board] = await Promise.all([
    findExistingSeedRanking(
      ctx,
      params.datasetKey,
      params.releaseId,
      params.rankingSeedExternalId
    ),
    findExistingSeedBoard(
      ctx,
      params.datasetKey,
      params.releaseId,
      params.boardSeedExternalId
    ),
  ])
  const rankingSlug = ranking?.slug ?? null
  if (ranking) await deleteRankingWithChildren(ctx, ranking)
  if (board) await deleteBoardWithChildren(ctx, board)
  return {
    rankingSlug,
    rankingsDeleted: ranking ? 1 : 0,
    boardsDeleted: board ? 1 : 0,
  }
}

const insertSeedRanking = async (
  ctx: MutationCtx,
  args: InsertSeedRankingArgs
): Promise<{
  rankingSlug: string
  rankingsDeleted: number
  boardsDeleted: number
  tiersWritten: number
  itemsWritten: number
}> =>
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
  const criterionSnapshot = {
    externalId: criterion.externalId,
    name: criterion.name,
    prompt: criterion.prompt,
  }
  const replacement = await replaceExistingSeedRows(ctx, {
    datasetKey: args.datasetKey,
    releaseId: args.releaseId,
    rankingSeedExternalId: args.seedExternalId,
    boardSeedExternalId: args.boardExternalId,
  })
  const now = Date.now()
  const boardId = await ctx.db.insert('boards', {
    externalId: args.boardExternalId,
    ownerId: user._id,
    title: normalizeBoardTitle(args.title),
    createdAt: args.createdAt,
    updatedAt: now,
    deletedAt: null,
    revision: 1,
    sourceTemplateId: args.template._id,
    sourceTemplateCategory: args.template.category,
    sourceTemplateSizeClass: args.template.sizeClass,
    preferredCriterionExternalId: criterion.externalId,
    ...buildFreshBoardCloudFields(now),
    itemAspectRatio: args.template.itemAspectRatio ?? undefined,
    itemAspectRatioMode: args.template.itemAspectRatioMode ?? undefined,
    defaultItemImageFit: args.template.defaultItemImageFit ?? undefined,
    labels: args.template.labels ?? undefined,
    activeItemCount: args.rankedItems.length,
    unrankedItemCount: 0,
    templateProgressState: resolveTemplateProgressState(args.template._id, {
      activeItemCount: args.rankedItems.length,
      unrankedItemCount: 0,
    }),
    librarySummary: EMPTY_BOARD_LIBRARY_SUMMARY,
    seedDatasetKey: args.datasetKey,
    seedReleaseId: args.releaseId,
    seedExternalId: args.boardExternalId,
    seedKind: args.seedKind === 'sample' ? 'ranking-sample' : 'ranking-curated',
    seedReleaseStatus: 'applied_hidden',
  })

  const tierEntries = await Promise.all(
    args.tiers.map(async (tier, order) =>
    {
      const externalId = tierSeedExternalId(args.seedExternalId, order)
      const boardTierId = await ctx.db.insert('boardTiers', {
        boardId,
        externalId,
        name: tier.name,
        description: tier.description,
        colorSpec: tier.colorSpec,
        rowColorSpec: tier.rowColorSpec,
        order,
      })
      return {
        boardTierId,
        externalId,
        order,
        name: tier.name,
        description: tier.description ?? null,
        colorSpec: tier.colorSpec,
        rowColorSpec: tier.rowColorSpec ?? null,
      }
    })
  )
  const summaryTiers: BoardLibrarySummaryTier[] = tierEntries.map((tier) => ({
    key: tier.externalId,
    order: tier.order,
    colorSpec: tier.colorSpec,
  }))
  const summaryItems: BoardLibrarySummaryItem[] = await Promise.all(
    args.rankedItems.map(async (ranked) =>
    {
      const tier = tierEntries[ranked.tierIndex]
      const externalId = itemSeedExternalId(args.seedExternalId, ranked.item)
      await ctx.db.insert('boardItems', {
        boardId,
        tierId: tier.boardTierId,
        externalId,
        label: ranked.item.label ?? undefined,
        backgroundColor: ranked.item.backgroundColor ?? undefined,
        altText: ranked.item.altText ?? undefined,
        mediaAssetId: ranked.item.mediaAssetId,
        order: ranked.orderInTier,
        deletedAt: null,
        aspectRatio: ranked.item.aspectRatio ?? undefined,
        imageFit: ranked.item.imageFit ?? undefined,
        transform: ranked.item.transform ?? undefined,
        templateItemId: ranked.item._id,
      })
      return {
        tierKey: tier.externalId,
        externalId,
        label: ranked.item.label,
        storageId: await loadMediaVariantStorageId(
          ctx,
          ranked.item.mediaAssetId
        ),
        order: ranked.orderInTier,
        deletedAt: null,
      }
    })
  )
  await ctx.db.patch(boardId, {
    librarySummary: buildBoardLibrarySummary({
      tiers: summaryTiers,
      items: summaryItems,
    }),
  })

  const rankingSlug =
    replacement.rankingSlug ?? (await allocateRankingSlug(ctx))
  const viewCount = Math.floor(unitHash(args.viewCountSeedKey) * 24)
  const rankingId = await ctx.db.insert('publishedRankings', {
    slug: rankingSlug,
    ownerId: user._id,
    sourceTemplateId: args.template._id,
    sourceBoardId: boardId,
    sourceTemplateSlug: args.template.slug,
    sourceTemplateTitle: args.template.title,
    sourceTemplateCategory: args.template.category,
    sourceCriterionExternalId: criterionSnapshot.externalId,
    sourceCriterionNameSnapshot: criterionSnapshot.name,
    sourceCriterionPromptSnapshot: criterionSnapshot.prompt,
    title: normalizeRankingTitle(args.title),
    description: normalizeRankingDescription(args.description),
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
        externalId: itemSeedExternalId(args.seedExternalId, ranked.item),
        tierExternalId: tier.externalId,
        label: ranked.item.label,
        backgroundColor: ranked.item.backgroundColor,
        altText: ranked.item.altText,
        mediaAssetId: ranked.item.mediaAssetId,
        order: ranked.globalOrder,
        aspectRatio: ranked.item.aspectRatio,
        imageFit: ranked.item.imageFit,
        transform: ranked.item.transform,
      })
    }),
  ])

  return {
    rankingSlug,
    rankingsDeleted: replacement.rankingsDeleted,
    boardsDeleted: replacement.boardsDeleted,
    tiersWritten: tierEntries.length,
    itemsWritten: args.rankedItems.length,
  }
}

const featuredForProfile = (
  lane: SeedRankingLane,
  profileKey: string
): { featuredRank: number; featuredBadge: RankingFeaturedBadge } | null =>
{
  const match = lane.featuredProfiles?.find(
    (profile) => profile.profileKey === profileKey
  )
  if (!match) return null
  return {
    featuredRank: match.featuredRank,
    featuredBadge: match.featuredBadge,
  }
}

export const upsertSampleSeedRankingImpl = internalMutation({
  args: {
    datasetKey: v.string(),
    releaseId: v.string(),
    target: seedRankingTargetValidator,
    lane: seedRankingLaneValidator,
    profile: seedRankingProfileValidator,
    sequence: v.number(),
  },
  returns: v.object({
    rankingsDeleted: v.number(),
    boardsDeleted: v.number(),
    tiersWritten: v.number(),
    itemsWritten: v.number(),
  }),
  handler: async (ctx, args) =>
  {
    const template = await requireSeedTemplate(
      ctx,
      args.datasetKey,
      args.releaseId,
      args.target.templateExternalId
    )
    const items = await loadTemplateItems(ctx, template._id)
    const tiers = resolveTemplateTiers(template)
    assertCountRange(
      'template tiers',
      tiers.length,
      1,
      SEED_LIMITS.rankingSeedTiersPerRanking
    )
    const rankedItems = rankTemplateItemsWithScore(items, tiers, (item) =>
      scoreLaneItem(
        args.target.templateExternalId,
        args.lane,
        args.profile,
        item
      )
    )
    const featured = featuredForProfile(args.lane, args.profile.key)
    const seedExternalId = rankingSeedExternalId(
      args.target.templateExternalId,
      args.lane.criterionExternalId,
      'sample',
      args.profile.key
    )
    const inserted = await insertSeedRanking(ctx, {
      datasetKey: args.datasetKey,
      releaseId: args.releaseId,
      templateExternalId: args.target.templateExternalId,
      criterionExternalId: args.lane.criterionExternalId,
      authorKey: args.profile.key,
      authorEmail: sampleAuthorEmail(args.profile.key),
      title: `${args.profile.displayName}'s ${args.lane.titleSuffix}`,
      description: args.lane.description || SAMPLE_RANKING_DESCRIPTION,
      seedExternalId,
      boardExternalId: boardSeedExternalId(
        args.target.templateExternalId,
        args.lane.criterionExternalId,
        'sample',
        args.profile.key
      ),
      seedKind: 'sample',
      seedProfileKey: args.profile.key,
      seedCuratedExternalId: null,
      rankedItems,
      tiers,
      template,
      featuredRank: featured?.featuredRank ?? null,
      featuredBadge: featured?.featuredBadge ?? null,
      createdAt: Date.now() - Math.max(1, args.sequence) * 60 * 60 * 1000,
      viewCountSeedKey: `views:${args.profile.key}:${args.target.templateExternalId}:${args.lane.criterionExternalId}`,
    })
    return {
      rankingsDeleted: inserted.rankingsDeleted,
      boardsDeleted: inserted.boardsDeleted,
      tiersWritten: inserted.tiersWritten,
      itemsWritten: inserted.itemsWritten,
    }
  },
})

export const upsertCuratedSeedRankingImpl = internalMutation({
  args: {
    datasetKey: v.string(),
    releaseId: v.string(),
    target: seedRankingTargetValidator,
    curated: seedCuratedRankingValidator,
    sequence: v.number(),
  },
  returns: v.object({
    rankingsDeleted: v.number(),
    boardsDeleted: v.number(),
    tiersWritten: v.number(),
    itemsWritten: v.number(),
  }),
  handler: async (ctx, args) =>
  {
    const template = await requireSeedTemplate(
      ctx,
      args.datasetKey,
      args.releaseId,
      args.target.templateExternalId
    )
    const items = await loadTemplateItems(ctx, template._id)
    const rankedItems = mapItemsToCuratedTiers(
      args.curated,
      items,
      `${args.target.templateExternalId}/${args.curated.externalId}`
    )
    const authorKey = curatedSeedAuthorKey(args.curated.authorKey)
    const seedExternalId = rankingSeedExternalId(
      args.target.templateExternalId,
      args.curated.criterionExternalId,
      'curated',
      args.curated.externalId
    )
    const inserted = await insertSeedRanking(ctx, {
      datasetKey: args.datasetKey,
      releaseId: args.releaseId,
      templateExternalId: args.target.templateExternalId,
      criterionExternalId: args.curated.criterionExternalId,
      authorKey,
      authorEmail: curatedAuthorEmail(args.curated),
      title: `${args.curated.authorDisplayName}'s ${args.curated.title}`,
      description: args.curated.description,
      seedExternalId,
      boardExternalId: boardSeedExternalId(
        args.target.templateExternalId,
        args.curated.criterionExternalId,
        'curated',
        args.curated.externalId
      ),
      seedKind: 'curated',
      seedProfileKey: null,
      seedCuratedExternalId: args.curated.externalId,
      rankedItems,
      tiers: args.curated.tiers,
      template,
      featuredRank: args.curated.featuredRank,
      featuredBadge: args.curated.featuredBadge,
      createdAt: Date.now() - Math.max(1, args.sequence) * 15 * 60 * 1000,
      viewCountSeedKey: `views:${authorKey}:${args.target.templateExternalId}:${args.curated.criterionExternalId}`,
    })
    return {
      rankingsDeleted: inserted.rankingsDeleted,
      boardsDeleted: inserted.boardsDeleted,
      tiersWritten: inserted.tiersWritten,
      itemsWritten: inserted.itemsWritten,
    }
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
  assertNonemptyString('datasetKey', args.datasetKey)
  assertNonemptyString('releaseId', args.releaseId)
  const diagnostics: SeedRankingDiagnostic[] = []
  const profileKeys = new Set<string>()
  for (const [index, profile] of args.rankingSeeds.profiles.entries())
  {
    if (profileKeys.has(profile.key))
    {
      diagnostics.push(
        errorDiagnostic(
          'duplicateProfileKey',
          `$.rankingSeeds.profiles[${index}].key`,
          profile.key
        )
      )
    }
    profileKeys.add(profile.key)
  }

  const authors = authorRequestsForManifest(args.rankingSeeds)
  const authorEmails = new Set<string>()
  for (const author of authors)
  {
    if (!isSeedRankingEmail(author.email))
    {
      diagnostics.push(
        errorDiagnostic(
          'invalidSeedAuthorEmail',
          '$.rankingSeeds',
          author.email
        )
      )
    }
    if (authorEmails.has(author.email))
    {
      diagnostics.push(
        errorDiagnostic(
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
        errorDiagnostic(
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
        errorDiagnostic(
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
          errorDiagnostic(
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
          errorDiagnostic(
            'missingCriterion',
            `${lanePath}.criterionExternalId`,
            error instanceof Error ? error.message : lane.criterionExternalId
          )
        )
      }
    }

    const featuredSlots = new Set<string>()
    for (const [curatedIndex, curated] of (
      target.curatedRankings ?? []
    ).entries())
    {
      const curatedPath = `${targetPath}.curatedRankings[${curatedIndex}]`
      try
      {
        resolveActiveTemplateCriterion(template, curated.criterionExternalId)
        const items = await loadTemplateItems(ctx, template._id)
        mapItemsToCuratedTiers(curated, items, curatedPath)
      }
      catch (error)
      {
        diagnostics.push(
          errorDiagnostic(
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
            errorDiagnostic(
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
            errorDiagnostic(
              'missingFeaturedBadge',
              `${curatedPath}.featuredBadge`,
              curated.externalId
            )
          )
        }
      }
    }
    if ((target.curatedRankings ?? []).length === 0)
    {
      diagnostics.push(
        warningDiagnostic(
          'targetHasNoCuratedRankings',
          targetPath,
          target.templateExternalId
        )
      )
    }
  }

  const existingSeedRankings = await loadExistingSeedRankingCount(
    ctx,
    args.datasetKey,
    args.releaseId
  )
  const existingActiveSeedRankings = await loadExistingActiveSeedRankingCount(
    ctx,
    args.datasetKey,
    args.releaseId
  )
  const sampleRankingsPlanned = countPlannedSampleRankings(args.rankingSeeds)
  const curatedRankingsPlanned = countPlannedCuratedRankings(args.rankingSeeds)
  if (
    args.verifyAppliedRows &&
    existingSeedRankings !== sampleRankingsPlanned + curatedRankingsPlanned
  )
  {
    diagnostics.push(
      errorDiagnostic(
        'seedRankingCountMismatch',
        '$.rankingSeeds',
        `expected ${sampleRankingsPlanned + curatedRankingsPlanned} seed rankings, found ${existingSeedRankings}`
      )
    )
  }

  return {
    datasetKey: args.datasetKey,
    releaseId: args.releaseId,
    profileCount: args.rankingSeeds.profiles.length,
    authorCount: authors.length,
    targetCount: args.rankingSeeds.targets.length,
    sampleRankingsPlanned,
    curatedRankingsPlanned,
    existingSeedRankings,
    existingActiveSeedRankings,
    aggregateLanes: plannedLaneSummaries(args.rankingSeeds),
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

export const applySeedRankings = internalAction({
  args: {
    datasetKey: v.string(),
    releaseId: v.string(),
    runId: v.string(),
    authorPassword: v.string(),
    rankingSeeds: seedRankingsManifestValidator,
  },
  returns: seedRankingApplyResultValidator,
  handler: async (ctx, args): Promise<SeedRankingApplyResult> =>
  {
    assertNonemptyString('runId', args.runId)
    assertNonemptyString('authorPassword', args.authorPassword)
    const preflight: SeedRankingPreflightResult = await ctx.runQuery(
      internal.marketplace.rankings.seed.preflightSeedRankings,
      {
        datasetKey: args.datasetKey,
        releaseId: args.releaseId,
        rankingSeeds: args.rankingSeeds,
      }
    )
    if (preflight.diagnostics.some((item) => item.severity === 'error'))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidInput,
        message: `ranking seed preflight failed with ${preflight.diagnostics.length} diagnostic(s)`,
      })
    }

    let authorsCreated = 0
    let authorsReused = 0
    let authorsPatched = 0
    for (const author of authorRequestsForManifest(args.rankingSeeds))
    {
      const ensured: { created: boolean } = await ctx.runAction(
        internal.marketplace.seedRuns.ensureSeedAuthor,
        { email: author.email, password: args.authorPassword }
      )
      if (ensured.created) authorsCreated += 1
      else authorsReused += 1
      const patched: { found: boolean } = await ctx.runMutation(
        internal.marketplace.templates.seed.patchSeedUserProfileImpl,
        { email: author.email, displayName: author.displayName }
      )
      if (patched.found) authorsPatched += 1
    }

    let boardsReplaced = 0
    let rankingsReplaced = 0
    let sampleRankingsApplied = 0
    let curatedRankingsApplied = 0
    let rankingTiersWritten = 0
    let rankingItemsWritten = 0
    let sequence = 0

    for (const target of args.rankingSeeds.targets)
    {
      const profileCount = normalizeProfileCount(args.rankingSeeds, target)
      const profiles = args.rankingSeeds.profiles.slice(0, profileCount)
      for (const lane of target.lanes)
      {
        for (const profile of profiles)
        {
          sequence += 1
          const result: {
            rankingsDeleted: number
            boardsDeleted: number
            tiersWritten: number
            itemsWritten: number
          } = await ctx.runMutation(
            internal.marketplace.rankings.seed.upsertSampleSeedRankingImpl,
            {
              datasetKey: args.datasetKey,
              releaseId: args.releaseId,
              target,
              lane,
              profile,
              sequence,
            }
          )
          rankingsReplaced += result.rankingsDeleted
          boardsReplaced += result.boardsDeleted
          rankingTiersWritten += result.tiersWritten
          rankingItemsWritten += result.itemsWritten
          sampleRankingsApplied += 1
        }
      }
      for (const curated of target.curatedRankings ?? [])
      {
        sequence += 1
        const result: {
          rankingsDeleted: number
          boardsDeleted: number
          tiersWritten: number
          itemsWritten: number
        } = await ctx.runMutation(
          internal.marketplace.rankings.seed.upsertCuratedSeedRankingImpl,
          {
            datasetKey: args.datasetKey,
            releaseId: args.releaseId,
            target,
            curated,
            sequence,
          }
        )
        rankingsReplaced += result.rankingsDeleted
        boardsReplaced += result.boardsDeleted
        rankingTiersWritten += result.tiersWritten
        rankingItemsWritten += result.itemsWritten
        curatedRankingsApplied += 1
      }
    }

    return {
      datasetKey: args.datasetKey,
      releaseId: args.releaseId,
      authorsCreated,
      authorsReused,
      authorsPatched,
      boardsReplaced,
      rankingsReplaced,
      sampleRankingsApplied,
      curatedRankingsApplied,
      rankingsApplied: sampleRankingsApplied + curatedRankingsApplied,
      rankingTiersWritten,
      rankingItemsWritten,
      aggregateLanes: preflight.aggregateLanes,
      diagnostics: preflight.diagnostics,
    }
  },
})
