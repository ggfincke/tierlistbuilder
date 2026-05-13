// convex/marketplace/rankings/seed.ts
// seed-gated writer for release-owned marketplace ranking snapshots

import { ConvexError, v } from 'convex/values'
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from '../../_generated/server'
import { internal } from '../../_generated/api'
import type { Doc, Id } from '../../_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import {
  normalizeBucketLabel,
  type RankingFeaturedBadge,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import type { TierPresetTier } from '@tierlistbuilder/contracts/workspace/tierPreset'
import { assertCountRange, assertNonemptyString } from '../../lib/assertions'
import { SEED_LIMITS } from '../../lib/limits'
import { sha256Hex } from '../../lib/sha256'
import { loadSeedTemplateLookupForRelease } from '../seedPipeline/templates'
import {
  resolveActiveTemplateCriterion,
  toTemplateCriterionSnapshot,
} from '../templates/criteria'
import {
  DEFAULT_TEMPLATE_TIERS,
  loadTemplateItems,
  validateTemplateTiers,
} from '../templates/lib'
import {
  allocateRankingSlug,
  compactRankingItemSnapshot,
  normalizeRankingDescription,
  normalizeRankingTitle,
  rankingTopScore,
} from './lib'
import { hasErrorDiagnostics } from '../seedPipeline/runs'
import {
  queueTemplateRankingAggregateRecompute,
  scheduleTemplateRankingAggregateJobAdmission,
} from './aggregate'
import {
  seedCuratedRankingValidator,
  seedRankingApplyChunkResultValidator,
  seedRankingAuthorEnsureResultValidator,
  seedRankingLaneValidator,
  seedRankingPreflightResultValidator,
  seedRankingProfileValidator,
  seedRankingTargetValidator,
  seedRankingsManifestValidator,
  type SeedCuratedRanking,
  type SeedRankingApplyChunkResult,
  type SeedRankingAuthorEnsureResult,
  type SeedRankingLane,
  type SeedRankingLaneSummary,
  type SeedRankingPreflightResult,
  type SeedRankingProfile,
  type SeedRankingTarget,
  type SeedRankingsManifest,
} from './seedValidators'
import type { SeedDiagnosticRow } from '../seedPipeline/types'

const SEED_EMAIL_DOMAIN = 'tierlistbuilder.local'
const SEED_AUTHOR_PREFIX = 'seed+rankings-'
const SAMPLE_RANKING_DESCRIPTION =
  'Seeded sample ranking for community feature testing.'
// Scan a small page to skip planned rows, but delete at most one stale
// ranking per mutation because each delete can cascade through ranking items,
// tiers, & a companion board.
const STALE_RANKING_CLEANUP_SCAN_PAGE_SIZE = 16

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

const diagnostic = (
  severity: SeedDiagnosticRow['severity'],
  code: string,
  path: string,
  message: string
): SeedDiagnosticRow => ({ severity, code, path, message })

const errorDiagnostic = (
  code: string,
  path: string,
  message: string
): SeedDiagnosticRow => diagnostic('error', code, path, message)

const warningDiagnostic = (
  code: string,
  path: string,
  message: string
): SeedDiagnosticRow => diagnostic('warning', code, path, message)

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

const RANKING_SEED_EXTERNAL_ID_PREFIX = 'ranking:'

const companionBoardSeedExternalId = (rankingExternalId: string): string =>
{
  if (!rankingExternalId.startsWith(RANKING_SEED_EXTERNAL_ID_PREFIX))
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: `expected ranking seed externalId prefix '${RANKING_SEED_EXTERNAL_ID_PREFIX}', got '${rankingExternalId}'`,
    })
  }
  return `board:${rankingExternalId.slice(RANKING_SEED_EXTERNAL_ID_PREFIX.length)}`
}

const tierSeedExternalId = (seedExternalId: string, order: number): string =>
  `${seedExternalId}:tier:${order.toString().padStart(2, '0')}`

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

const stableStringify = (value: unknown): string =>
{
  if (value === null || typeof value !== 'object')
  {
    return JSON.stringify(value) ?? 'undefined'
  }
  if (Array.isArray(value))
  {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  const entries = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
  return `{${entries.join(',')}}`
}

const seedContentHash = async (
  kind: string,
  payload: unknown
): Promise<string> =>
{
  const serialized = stableStringify({ kind, payload })
  const digest = await sha256Hex(new TextEncoder().encode(serialized))
  return `v1:${digest.slice(0, 32)}`
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

const plannedRankingSeedExternalIds = (
  manifest: SeedRankingsManifest
): string[] =>
{
  const planned: string[] = []
  for (const target of manifest.targets)
  {
    const profileCount = normalizeProfileCount(manifest, target)
    const profiles = manifest.profiles.slice(0, profileCount)
    for (const lane of target.lanes)
    {
      for (const profile of profiles)
      {
        planned.push(
          rankingSeedExternalId(
            target.templateExternalId,
            lane.criterionExternalId,
            'sample',
            profile.key
          )
        )
      }
    }
    for (const curated of target.curatedRankings ?? [])
    {
      planned.push(
        rankingSeedExternalId(
          target.templateExternalId,
          curated.criterionExternalId,
          'curated',
          curated.externalId
        )
      )
    }
  }
  return planned
}

const ensureRankingSeedAuthors = async (
  ctx: ActionCtx,
  authorPassword: string,
  rankingSeeds: SeedRankingsManifest
): Promise<{
  authorsCreated: number
  authorsReused: number
  authorsPatched: number
}> =>
{
  let authorsCreated = 0
  let authorsReused = 0
  let authorsPatched = 0
  for (const author of authorRequestsForManifest(rankingSeeds))
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

const countExistingSeedRankings = async (
  ctx: QueryCtx,
  datasetKey: string,
  releaseId: string,
  activeOnly = false
): Promise<number> =>
{
  const rows = activeOnly
    ? await ctx.db
        .query('publishedRankings')
        .withIndex('bySeedDatasetReleaseStatus', (q) =>
          q
            .eq('seedDatasetKey', datasetKey)
            .eq('seedReleaseId', releaseId)
            .eq('seedReleaseStatus', 'active')
        )
        .take(SEED_LIMITS.rankingSeedRowsPerRelease + 1)
    : await ctx.db
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
    const key = normalizeBucketLabel(tier.name)
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
    const tierIndex = tiersByName.get(normalizeBucketLabel(group.tierName))
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
  }
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
    tiers: args.tiers.map((tier, order) => ({
      externalId: tierSeedExternalId(args.seedExternalId, order),
      order,
      name: tier.name,
      description: tier.description ?? null,
      colorSpec: tier.colorSpec,
      rowColorSpec: tier.rowColorSpec ?? null,
    })),
    rankedItems: args.rankedItems.map((ranked) => ({
      templateItemId: ranked.item._id,
      templateItemExternalId: ranked.item.externalId,
      ...compactRankingItemSnapshot(ranked.item),
      order: ranked.item.order,
      tierIndex: ranked.tierIndex,
      orderInTier: ranked.orderInTier,
      globalOrder: ranked.globalOrder,
    })),
  })

const seedRowsAreReusable = (
  ranking: Doc<'publishedRankings'> | null,
  contentHash: string
): boolean =>
  ranking !== null &&
  ranking.seedContentHash === contentHash &&
  ranking.seedReleaseStatus !== null &&
  seedRankingLifecycleFieldsMatchStatus(ranking)

const seedRankingLifecycleFieldsMatchStatus = (
  ranking: Doc<'publishedRankings'>
): boolean =>
{
  const status = ranking.seedReleaseStatus
  if (status === null) return false
  switch (status)
  {
    case 'active':
    {
      const hasFeaturedSlot =
        ranking.featuredRank !== null && ranking.featuredBadge !== null
      return (
        ranking.visibility === 'public' &&
        ranking.publicationState === 'published' &&
        ranking.isPubliclyListable &&
        ranking.isFeatured === hasFeaturedSlot
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
  if (seedRowsAreReusable(ranking, params.contentHash))
  {
    if (board) await deleteBoardWithChildren(ctx, board)
    return {
      rankingSlug,
      rankingsDeleted: 0,
      boardsDeleted: board ? 1 : 0,
      rankingsUnchanged: 1,
      skipped: true,
    }
  }
  if (ranking) await deleteRankingWithChildren(ctx, ranking)
  if (board) await deleteBoardWithChildren(ctx, board)
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
    assertNonemptyString('datasetKey', args.datasetKey)
    assertNonemptyString('releaseId', args.releaseId)
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
    const boardSeedId = companionBoardSeedExternalId(seedExternalId)
    const sourceBoard =
      rankingToDelete.sourceBoardId !== null
        ? await ctx.db.get(rankingToDelete.sourceBoardId)
        : null
    const board =
      sourceBoard ??
      (await findExistingSeedBoard(
        ctx,
        args.datasetKey,
        args.releaseId,
        boardSeedId
      ))
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
    await deleteRankingWithChildren(ctx, rankingToDelete)
    let boardsDeleted = 0
    if (
      board &&
      board.seedDatasetKey === args.datasetKey &&
      board.seedReleaseId === args.releaseId
    )
    {
      await deleteBoardWithChildren(ctx, board)
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
  const viewCount = Math.floor(unitHash(args.viewCountSeedKey) * 24)
  const contentHash = await buildSeedRankingContentHash(
    args,
    criterionSnapshot,
    {
      rankingTitle,
      rankingDescription,
      viewCount,
    }
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
  const tierEntries = args.tiers.map((tier, order) => ({
    externalId: tierSeedExternalId(args.seedExternalId, order),
    order,
    name: tier.name,
    description: tier.description ?? null,
    colorSpec: tier.colorSpec,
    rowColorSpec: tier.rowColorSpec ?? null,
  }))

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
        ...compactRankingItemSnapshot(ranked.item),
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
    rankingsUnchanged: v.number(),
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
    return inserted
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
    rankingsUnchanged: v.number(),
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
    return inserted
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
  const diagnostics: SeedDiagnosticRow[] = []
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
    const curatedRankings = target.curatedRankings ?? []
    // load template items once per target; mapItemsToCuratedTiers only walks
    // them in-memory, so sharing the same array across every curated ranking
    // on this template avoids one byTemplate scan per curated entry
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

  const [existingSeedRankings, existingActiveSeedRankings] = await Promise.all([
    countExistingSeedRankings(ctx, args.datasetKey, args.releaseId),
    countExistingSeedRankings(ctx, args.datasetKey, args.releaseId, true),
  ])
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

const loadSeedRankingPreflight = async (
  ctx: ActionCtx,
  args: {
    datasetKey: string
    releaseId: string
    rankingSeeds: SeedRankingsManifest
  }
): Promise<SeedRankingPreflightResult> =>
  await ctx.runQuery(internal.marketplace.rankings.seed.preflightSeedRankings, {
    datasetKey: args.datasetKey,
    releaseId: args.releaseId,
    rankingSeeds: args.rankingSeeds,
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

type SeedRankingApplyTask =
  | {
      kind: 'sample'
      target: SeedRankingTarget
      lane: SeedRankingLane
      profile: SeedRankingProfile
      sequence: number
    }
  | {
      kind: 'curated'
      target: SeedRankingTarget
      curated: SeedCuratedRanking
      sequence: number
    }

// bound on per-action mutation concurrency. Distinct rankingId rows give
// low OCC contention, but convex per-deployment write-rate caps still apply
const SEED_RANKING_APPLY_CONCURRENCY = 4

const planSeedRankingApplyTasks = (
  manifest: SeedRankingsManifest
): SeedRankingApplyTask[] =>
{
  const tasks: SeedRankingApplyTask[] = []
  let sequence = 0
  for (const target of manifest.targets)
  {
    const profileCount = normalizeProfileCount(manifest, target)
    const profiles = manifest.profiles.slice(0, profileCount)
    for (const lane of target.lanes)
    {
      for (const profile of profiles)
      {
        sequence += 1
        tasks.push({ kind: 'sample', target, lane, profile, sequence })
      }
    }
    for (const curated of target.curatedRankings ?? [])
    {
      sequence += 1
      tasks.push({ kind: 'curated', target, curated, sequence })
    }
  }
  return tasks
}

const runSeedRankingApplyTask = async (
  ctx: ActionCtx,
  datasetKey: string,
  releaseId: string,
  task: SeedRankingApplyTask
): Promise<SeedRankingWriteResult> =>
{
  if (task.kind === 'sample')
  {
    return await ctx.runMutation(
      internal.marketplace.rankings.seed.upsertSampleSeedRankingImpl,
      {
        datasetKey,
        releaseId,
        target: task.target,
        lane: task.lane,
        profile: task.profile,
        sequence: task.sequence,
      }
    )
  }
  return await ctx.runMutation(
    internal.marketplace.rankings.seed.upsertCuratedSeedRankingImpl,
    {
      datasetKey,
      releaseId,
      target: task.target,
      curated: task.curated,
      sequence: task.sequence,
    }
  )
}

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
    assertNonemptyString('runId', args.runId)

    const tasks = planSeedRankingApplyTasks(args.rankingSeeds)
    const results: SeedRankingWriteResult[] = new Array(tasks.length)
    for (let i = 0; i < tasks.length; i += SEED_RANKING_APPLY_CONCURRENCY)
    {
      const slice = tasks.slice(i, i + SEED_RANKING_APPLY_CONCURRENCY)
      const sliceResults = await Promise.all(
        slice.map((task) =>
          runSeedRankingApplyTask(ctx, args.datasetKey, args.releaseId, task)
        )
      )
      for (let j = 0; j < sliceResults.length; j++)
      {
        results[i + j] = sliceResults[j]
      }
    }

    let boardsReplaced = 0
    let rankingsReplaced = 0
    let rankingsUnchanged = 0
    let rankingTiersWritten = 0
    let rankingItemsWritten = 0
    let sampleRankingsApplied = 0
    let curatedRankingsApplied = 0
    for (let i = 0; i < tasks.length; i++)
    {
      const result = results[i]
      boardsReplaced += result.boardsDeleted
      rankingsReplaced += result.rankingsDeleted
      rankingsUnchanged += result.rankingsUnchanged
      rankingTiersWritten += result.tiersWritten
      rankingItemsWritten += result.itemsWritten
      if (tasks[i].kind === 'sample') sampleRankingsApplied += 1
      else curatedRankingsApplied += 1
    }

    return {
      datasetKey: args.datasetKey,
      releaseId: args.releaseId,
      boardsReplaced,
      rankingsReplaced,
      rankingsUnchanged,
      sampleRankingsApplied,
      curatedRankingsApplied,
      rankingsApplied: sampleRankingsApplied + curatedRankingsApplied,
      rankingTiersWritten,
      rankingItemsWritten,
      aggregateLanes: plannedLaneSummaries(args.rankingSeeds),
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
    assertNonemptyString('runId', args.runId)
    const plannedSeedExternalIds = plannedRankingSeedExternalIds(
      args.rankingSeeds
    )
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
      } = await ctx.runMutation(
        internal.marketplace.rankings.seed.deleteStaleSeedRankingRowsImpl,
        {
          datasetKey: args.datasetKey,
          releaseId: args.releaseId,
          plannedSeedExternalIds,
          cursor,
        }
      )
      rankingsDeleted += result.rankingsDeleted
      boardsDeleted += result.boardsDeleted
      if (result.isDone) break
      cursor = result.cursor
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
    assertNonemptyString('datasetKey', args.datasetKey)
    assertNonemptyString('releaseId', args.releaseId)
    assertNonemptyString('runId', args.runId)
    assertNonemptyString('authorPassword', args.authorPassword)
    const preflight = await loadSeedRankingPreflight(ctx, args)
    throwIfRankingPreflightErrors(preflight.diagnostics)
    const result = await ensureRankingSeedAuthors(
      ctx,
      args.authorPassword,
      args.rankingSeeds
    )
    return {
      datasetKey: args.datasetKey,
      releaseId: args.releaseId,
      ...result,
      diagnostics: preflight.diagnostics,
    }
  },
})
