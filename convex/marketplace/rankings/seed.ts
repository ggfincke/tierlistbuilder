// convex/marketplace/rankings/seed.ts
// dev-only seeding for sample community rankings on featured templates

import { ConvexError, v } from 'convex/values'
import {
  action,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from '../../_generated/server'
import { internal } from '../../_generated/api'
import type { Doc, Id } from '../../_generated/dataModel'
import {
  RANKING_FEATURED_BADGES,
  type RankingFeaturedBadge,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { normalizeBoardTitle } from '@tierlistbuilder/contracts/workspace/board'
import type { TierPresetTier } from '@tierlistbuilder/contracts/workspace/tierPreset'
import { buildFreshBoardCloudFields } from '../../workspace/boards/cloudFields'
import {
  buildBoardLibrarySummary,
  EMPTY_BOARD_LIBRARY_SUMMARY,
  type BoardLibrarySummaryItem,
  type BoardLibrarySummaryTier,
} from '../../workspace/boards/librarySummary'
import { loadMediaVariantStorageId } from '../../lib/mediaVariants'
import { resolveTemplateProgressState } from '../../lib/templateProgress'
import {
  DEFAULT_TEMPLATE_TIERS,
  findTemplateCardByTemplateId,
  findTemplateStatsByTemplateId,
  isPublishedTemplateRow,
  loadTemplateItems,
} from '../templates/lib'
import { queueTemplateRankingAggregateRecompute } from './aggregate'
import {
  allocateRankingSlug,
  normalizeRankingDescription,
  normalizeRankingTitle,
  rankingTopScore,
} from './lib'

const SEED_SECRET_ENV = 'CONVEX_SEED_SECRET'
const SEED_EMAIL_DOMAIN = 'tierlistbuilder.local'
const DEFAULT_SAMPLE_USER_COUNT = 16
const SEED_WRITE_PAUSE_MS = 500
const MAX_TARGET_SEARCH_CARDS = 200
const MAX_SEED_ROW_ITEMS = 300
const MAX_SEED_ROW_TIERS = 64
const MAX_SEED_OWNER_RANKINGS = 120
const HOUR_MS = 60 * 60 * 1000

const targetKeyValidator = v.union(
  v.literal('ssbu'),
  v.literal('zelda'),
  v.literal('mcu')
)

type TargetKey = 'ssbu' | 'zelda' | 'mcu'

interface FeaturedSeedProfile
{
  profileIndex: number
  featuredRank: number
  featuredBadge: RankingFeaturedBadge
}

interface SeedTargetDefinition
{
  key: TargetKey
  title: string
  category: Doc<'templates'>['category']
  featuredRank: number
  rankingTitle: string
  boostTerms: readonly string[]
  dropTerms: readonly string[]
}

interface SeedProfile
{
  key: string
  displayName: string
  chaos: number
  contrarian: number
  boostTerms: Partial<Record<TargetKey, readonly string[]>>
  dropTerms?: Partial<Record<TargetKey, readonly string[]>>
}

const SEED_TARGETS: readonly SeedTargetDefinition[] = [
  {
    key: 'ssbu',
    title: 'Super Smash Bros. Ultimate roster',
    category: 'gaming',
    featuredRank: 0,
    rankingTitle: 'Smash roster',
    boostTerms: [
      'mario',
      'link',
      'samus',
      'pikachu',
      'kirby',
      'fox',
      'joker',
      'sora',
      'sephiroth',
      'captain falcon',
      'donkey kong',
      'yoshi',
    ],
    dropTerms: ['mii', 'duck hunt', 'wii fit', 'dr. mario', 'pichu'],
  },
  {
    key: 'zelda',
    title: 'Legend of Zelda mainline',
    category: 'gaming',
    featuredRank: 1,
    rankingTitle: 'Zelda mainline',
    boostTerms: [
      'ocarina',
      'breath',
      'tears',
      'majora',
      'wind waker',
      'a link to the past',
      'twilight princess',
      'link awakening',
    ],
    dropTerms: ['tri force', 'four swords', 'phantom hourglass', 'zelda ii'],
  },
  {
    key: 'mcu',
    title: 'MCU films',
    category: 'movies',
    featuredRank: 2,
    rankingTitle: 'MCU films',
    boostTerms: [
      'iron man',
      'the avengers',
      'winter soldier',
      'civil war',
      'infinity war',
      'endgame',
      'guardians',
      'black panther',
      'ragnarok',
      'no way home',
    ],
    dropTerms: ['dark world', 'quantumania', 'eternals', 'incredible hulk'],
  },
]

const FEATURED_PROFILE_BADGES: readonly FeaturedSeedProfile[] = [
  {
    profileIndex: 0,
    featuredRank: 0,
    featuredBadge: RANKING_FEATURED_BADGES[0],
  },
  {
    profileIndex: 1,
    featuredRank: 1,
    featuredBadge: RANKING_FEATURED_BADGES[1],
  },
]

const SAMPLE_PROFILES: readonly SeedProfile[] = [
  {
    key: 'ava-byte',
    displayName: 'Ava Byte',
    chaos: 0.2,
    contrarian: 0.05,
    boostTerms: {
      ssbu: ['samus', 'zero suit', 'fox'],
      zelda: ['wind waker', 'link awakening'],
      mcu: ['guardians', 'spider'],
    },
  },
  {
    key: 'ben-combo',
    displayName: 'Ben Combo',
    chaos: 0.28,
    contrarian: 0.12,
    boostTerms: {
      ssbu: ['captain falcon', 'little mac', 'ryu', 'ken'],
      zelda: ['majora', 'twilight'],
      mcu: ['winter soldier', 'civil war'],
    },
  },
  {
    key: 'cora-quest',
    displayName: 'Cora Quest',
    chaos: 0.16,
    contrarian: 0,
    boostTerms: {
      ssbu: ['kirby', 'yoshi', 'pikachu'],
      zelda: ['ocarina', 'breath', 'tears'],
      mcu: ['endgame', 'infinity war', 'avengers'],
    },
  },
  {
    key: 'diego-frame',
    displayName: 'Diego Frame',
    chaos: 0.32,
    contrarian: 0.25,
    boostTerms: {
      ssbu: ['wario', 'snake', 'ness'],
      zelda: ['spirit tracks', 'phantom hourglass'],
      mcu: ['doctor strange', 'ant-man'],
    },
    dropTerms: { mcu: ['endgame'] },
  },
  {
    key: 'elise-circuit',
    displayName: 'Elise Circuit',
    chaos: 0.22,
    contrarian: 0.08,
    boostTerms: {
      ssbu: ['link', 'zelda', 'ganondorf'],
      zelda: ['a link to the past', 'link between worlds'],
      mcu: ['black panther', 'shang-chi'],
    },
  },
  {
    key: 'finn-nova',
    displayName: 'Finn Nova',
    chaos: 0.4,
    contrarian: 0.35,
    boostTerms: {
      ssbu: ['banjo', 'duck hunt', 'rob'],
      zelda: ['skyward sword', 'minish cap'],
      mcu: ['thor', 'ragnarok', 'dark world'],
    },
  },
  {
    key: 'gia-pilot',
    displayName: 'Gia Pilot',
    chaos: 0.18,
    contrarian: 0.04,
    boostTerms: {
      ssbu: ['falco', 'wolf', 'fox'],
      zelda: ['breath', 'tears'],
      mcu: ['captain marvel', 'black widow'],
    },
  },
  {
    key: 'hugo-bloom',
    displayName: 'Hugo Bloom',
    chaos: 0.3,
    contrarian: 0.18,
    boostTerms: {
      ssbu: ['peach', 'daisy', 'rosalina'],
      zelda: ['oracle', 'seasons', 'ages'],
      mcu: ['guardians', 'ant-man', 'wasp'],
    },
  },
  {
    key: 'iris-lane',
    displayName: 'Iris Lane',
    chaos: 0.24,
    contrarian: 0.1,
    boostTerms: {
      ssbu: ['marth', 'lucina', 'ike'],
      zelda: ['twilight princess', 'majora'],
      mcu: ['black panther', 'wakanda'],
    },
  },
  {
    key: 'jae-tempo',
    displayName: 'Jae Tempo',
    chaos: 0.35,
    contrarian: 0.22,
    boostTerms: {
      ssbu: ['sonic', 'mega man', 'pac-man'],
      zelda: ['zelda ii', 'adventure of link'],
      mcu: ['iron man 3', 'multiverse'],
    },
  },
  {
    key: 'kira-vale',
    displayName: 'Kira Vale',
    chaos: 0.19,
    contrarian: 0.03,
    boostTerms: {
      ssbu: ['sora', 'joker', 'sephiroth'],
      zelda: ['ocarina', 'a link to the past'],
      mcu: ['no way home', 'far from home'],
    },
  },
  {
    key: 'leo-sparks',
    displayName: 'Leo Sparks',
    chaos: 0.27,
    contrarian: 0.14,
    boostTerms: {
      ssbu: ['bowser', 'king k. rool', 'ridley'],
      zelda: ['link awakening', 'minish'],
      mcu: ['hulk', 'thor'],
    },
  },
  {
    key: 'mina-orbit',
    displayName: 'Mina Orbit',
    chaos: 0.31,
    contrarian: 0.2,
    boostTerms: {
      ssbu: ['villager', 'isabelle', 'steve'],
      zelda: ['skyward sword', 'wind waker'],
      mcu: ['eternals', 'captain america'],
    },
  },
  {
    key: 'nico-slate',
    displayName: 'Nico Slate',
    chaos: 0.21,
    contrarian: 0.07,
    boostTerms: {
      ssbu: ['cloud', 'sephiroth', 'hero'],
      zelda: ['tears', 'breath'],
      mcu: ['infinity war', 'endgame'],
    },
  },
  {
    key: 'olive-ray',
    displayName: 'Olive Ray',
    chaos: 0.37,
    contrarian: 0.28,
    boostTerms: {
      ssbu: ['jigglypuff', 'pichu', 'pokemon trainer'],
      zelda: ['four swords', 'tri force'],
      mcu: ['quantumania', 'captain marvel'],
    },
  },
  {
    key: 'pax-stone',
    displayName: 'Pax Stone',
    chaos: 0.23,
    contrarian: 0.09,
    boostTerms: {
      ssbu: ['donkey kong', 'diddy kong', 'yoshi'],
      zelda: ['twilight', 'majora'],
      mcu: ['ragnarok', 'guardians'],
    },
  },
]

const seedTargetResultValidator = v.object({
  key: targetKeyValidator,
  title: v.string(),
  slug: v.string(),
  itemCount: v.number(),
  rankingsSeeded: v.number(),
  rankingsDeleted: v.number(),
})

const seedCommunityRankingsResultValidator = v.object({
  usersSeeded: v.number(),
  rankingsSeeded: v.number(),
  rankingsDeleted: v.number(),
  aggregatesQueued: v.number(),
  targets: v.array(seedTargetResultValidator),
})

interface SeedTargetResolution
{
  key: TargetKey
  title: string
  slug: string
  templateId: Id<'templates'>
  itemCount: number
}

interface SeedRankingResult
{
  targetKey: TargetKey
  templateSlug: string
  userEmail: string
  rankingSlug: string
  boardExternalId: string
  itemsRanked: number
  rankingsDeleted: number
}

interface SeedResetResult
{
  rankingsDeleted: number
  boardsDeleted: number
}

interface SeedTargetResult
{
  key: TargetKey
  title: string
  slug: string
  itemCount: number
  rankingsSeeded: number
  rankingsDeleted: number
}

interface SeedCommunityRankingsResult
{
  usersSeeded: number
  rankingsSeeded: number
  rankingsDeleted: number
  aggregatesQueued: number
  targets: SeedTargetResult[]
}

interface RankedSeedItem
{
  item: Doc<'templateItems'>
  tierIndex: number
  orderInTier: number
  globalOrder: number
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

const pauseSeedWrites = async (): Promise<void> =>
{
  if (SEED_WRITE_PAUSE_MS <= 0) return
  await sleep(SEED_WRITE_PAUSE_MS)
}

const requireSeedAuthorized = (seedSecret: string): void =>
{
  if (process.env.CONVEX_SEED_ENABLED !== 'true')
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.forbidden,
      message:
        'seeding is disabled - set CONVEX_SEED_ENABLED=true on this deployment to allow it',
    })
  }

  const expectedSecret = process.env.CONVEX_SEED_SECRET
  if (!expectedSecret || seedSecret !== expectedSecret)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.forbidden,
      message: `seeding is locked - pass the deployment ${SEED_SECRET_ENV} value`,
    })
  }
}

const normalizeUserCount = (raw: number | undefined): number =>
{
  if (raw === undefined) return DEFAULT_SAMPLE_USER_COUNT
  if (!Number.isFinite(raw) || raw < 1)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidInput,
      message: 'userCount must be a positive number',
    })
  }
  return Math.min(SAMPLE_PROFILES.length, Math.floor(raw))
}

const targetDefinitionByKey = (key: TargetKey): SeedTargetDefinition =>
{
  const target = SEED_TARGETS.find((candidate) => candidate.key === key)
  if (!target)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidInput,
      message: `unknown seed target: ${key}`,
    })
  }
  return target
}

const sampleProfileAt = (profileIndex: number): SeedProfile =>
{
  if (
    !Number.isInteger(profileIndex) ||
    profileIndex < 0 ||
    profileIndex >= SAMPLE_PROFILES.length
  )
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidInput,
      message: 'profileIndex is outside the sample profile range',
    })
  }
  return SAMPLE_PROFILES[profileIndex]
}

const seedUserEmail = (profile: SeedProfile): string =>
  `seed+rankings-${profile.key}@${SEED_EMAIL_DOMAIN}`

const seedUserExternalId = (profile: SeedProfile): string =>
  `user-seed-rankings-${profile.key}`

const seedBoardExternalId = (
  profile: SeedProfile,
  target: SeedTargetDefinition
): string => `board-seed-rankings-${target.key}-${profile.key}`

const seedTierExternalId = (
  profile: SeedProfile,
  target: SeedTargetDefinition,
  tierIndex: number
): string => `tier-seed-rankings-${target.key}-${profile.key}-${tierIndex}`

const seedItemExternalId = (
  profile: SeedProfile,
  target: SeedTargetDefinition,
  item: Doc<'templateItems'>
): string =>
  `seed-rankings-${target.key}-${profile.key}-${item.order.toString().padStart(3, '0')}`

const seedRankingTitle = (
  profile: SeedProfile,
  target: SeedTargetDefinition
): string => `${profile.displayName}'s ${target.rankingTitle}`

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

const termMatches = (label: string, terms: readonly string[]): number =>
  terms.reduce((sum, term) => (label.includes(term) ? sum + 1 : sum), 0)

const scoreTemplateItem = (
  target: SeedTargetDefinition,
  profile: SeedProfile,
  item: Doc<'templateItems'>
): number =>
{
  const label = (item.label ?? item.externalId).toLowerCase()
  const crowd = unitHash(`crowd:${target.key}:${label}`)
  const personal = unitHash(`personal:${profile.key}:${target.key}:${label}`)
  const baseCrowd = crowd * (1 - profile.contrarian)
  const baseContrarian = (1 - crowd) * profile.contrarian
  let score = (baseCrowd + baseContrarian) * (1 - profile.chaos)
  score += personal * profile.chaos
  score += termMatches(label, target.boostTerms) * 0.2
  score -= termMatches(label, target.dropTerms) * 0.24
  score += termMatches(label, profile.boostTerms[target.key] ?? []) * 0.3
  score -= termMatches(label, profile.dropTerms?.[target.key] ?? []) * 0.3
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

const rankTemplateItems = (
  target: SeedTargetDefinition,
  profile: SeedProfile,
  items: readonly Doc<'templateItems'>[],
  tiers: readonly TierPresetTier[]
): RankedSeedItem[] =>
{
  const scored = items
    .map((item) => ({
      item,
      score: scoreTemplateItem(target, profile, item),
    }))
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

const assertSeedRowsWithinLimit = <T>(
  label: string,
  rows: readonly T[],
  max: number
): void =>
{
  if (rows.length <= max) return
  throw new ConvexError({
    code: CONVEX_ERROR_CODES.invalidState,
    message: `${label} exceeds the seed script safety limit`,
  })
}

const findSeedUser = async (
  ctx: MutationCtx,
  profile: SeedProfile
): Promise<Doc<'users'> | null> =>
  await ctx.db
    .query('users')
    .withIndex('email', (q) => q.eq('email', seedUserEmail(profile)))
    .unique()

const ensureSeedUser = async (
  ctx: MutationCtx,
  profile: SeedProfile,
  now: number
): Promise<Doc<'users'>> =>
{
  const email = seedUserEmail(profile)
  const existing = await findSeedUser(ctx, profile)
  const fields = {
    name: profile.displayName,
    displayName: profile.displayName,
    email,
    externalId: seedUserExternalId(profile),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    plan: 'free' as const,
  }

  if (existing)
  {
    await ctx.db.patch(existing._id, {
      ...fields,
      lastUpsertError: undefined,
    })
    const updated = await ctx.db.get(existing._id)
    if (!updated)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: `seed user missing after update: ${email}`,
      })
    }
    return updated
  }

  const userId = await ctx.db.insert('users', fields)
  const inserted = await ctx.db.get(userId)
  if (!inserted)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.notFound,
      message: `seed user missing after insert: ${email}`,
    })
  }
  return inserted
}

const deleteRankingWithChildren = async (
  ctx: MutationCtx,
  ranking: Doc<'publishedRankings'>
): Promise<void> =>
{
  const [items, tiers] = await Promise.all([
    ctx.db
      .query('publishedRankingItems')
      .withIndex('byRanking', (q) => q.eq('rankingId', ranking._id))
      .take(MAX_SEED_ROW_ITEMS + 1),
    ctx.db
      .query('publishedRankingTiers')
      .withIndex('byRanking', (q) => q.eq('rankingId', ranking._id))
      .take(MAX_SEED_ROW_TIERS + 1),
  ])
  assertSeedRowsWithinLimit(
    'published ranking items',
    items,
    MAX_SEED_ROW_ITEMS
  )
  assertSeedRowsWithinLimit(
    'published ranking tiers',
    tiers,
    MAX_SEED_ROW_TIERS
  )
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
      .take(MAX_SEED_ROW_ITEMS + 1),
    ctx.db
      .query('boardTiers')
      .withIndex('byBoard', (q) => q.eq('boardId', board._id))
      .take(MAX_SEED_ROW_TIERS + 1),
  ])
  assertSeedRowsWithinLimit('board items', items, MAX_SEED_ROW_ITEMS)
  assertSeedRowsWithinLimit('board tiers', tiers, MAX_SEED_ROW_TIERS)
  await Promise.all([
    ...items.map((item) => ctx.db.delete(item._id)),
    ...tiers.map((tier) => ctx.db.delete(tier._id)),
    ctx.db.delete(board._id),
  ])
}

const findSeedBoard = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  boardExternalId: string
): Promise<Doc<'boards'> | null> =>
  await ctx.db
    .query('boards')
    .withIndex('byOwnerAndExternalId', (q) =>
      q.eq('ownerId', userId).eq('externalId', boardExternalId)
    )
    .unique()

const adjustTemplateUseCount = async (
  ctx: MutationCtx,
  templateId: Id<'templates'>,
  delta: number,
  now: number
): Promise<void> =>
{
  if (delta === 0) return

  const stats = await findTemplateStatsByTemplateId(ctx, templateId)
  const card = await findTemplateCardByTemplateId(ctx, templateId)
  if (!stats || !card) return

  const useCount = Math.max(0, stats.useCount + delta)
  await Promise.all([
    ctx.db.patch(stats._id, {
      useCount,
      updatedAt: now,
    }),
    ctx.db.patch(card._id, {
      useCount,
    }),
  ])
}

const deleteSeedPair = async (
  ctx: MutationCtx,
  user: Doc<'users'>,
  templateId: Id<'templates'>,
  profile: SeedProfile,
  target: SeedTargetDefinition
): Promise<SeedResetResult> =>
{
  const boardExternalId = seedBoardExternalId(profile, target)
  const rankingTitle = seedRankingTitle(profile, target)
  const board = await findSeedBoard(ctx, user._id, boardExternalId)
  const rankingRows = await ctx.db
    .query('publishedRankings')
    .withIndex('bySourceTemplateOwnerPublicCreatedAt', (q) =>
      q
        .eq('sourceTemplateId', templateId)
        .eq('ownerId', user._id)
        .eq('isPubliclyListable', true)
    )
    .take(MAX_SEED_OWNER_RANKINGS)
  const rankings = new Map<Id<'publishedRankings'>, Doc<'publishedRankings'>>()

  for (const ranking of rankingRows)
  {
    if (
      ranking.title === rankingTitle ||
      ranking.sourceBoardId === board?._id
    )
    {
      rankings.set(ranking._id, ranking)
    }
  }

  for (const ranking of rankings.values())
  {
    await deleteRankingWithChildren(ctx, ranking)
  }
  if (board) await deleteBoardWithChildren(ctx, board)
  if (board) await adjustTemplateUseCount(ctx, templateId, -1, Date.now())

  return {
    rankingsDeleted: rankings.size,
    boardsDeleted: board ? 1 : 0,
  }
}

const resolveTemplateTiers = (
  template: Doc<'templates'>
): readonly TierPresetTier[] =>
  template.suggestedTiers.length > 0
    ? template.suggestedTiers
    : DEFAULT_TEMPLATE_TIERS

const findPublishedTargetTemplateForCard = async (
  ctx: QueryCtx,
  card: Doc<'templateCards'> | undefined,
  target: SeedTargetDefinition
): Promise<Doc<'templates'> | null> =>
{
  if (
    !card ||
    card.title !== target.title ||
    card.category !== target.category
  )
  {
    return null
  }
  const template = await ctx.db.get(card.templateId)
  return template && isPublishedTemplateRow(template) ? template : null
}

const resolveTargetTemplate = async (
  ctx: QueryCtx,
  target: SeedTargetDefinition
): Promise<Doc<'templates'>> =>
{
  const featuredCards = await ctx.db
    .query('templateCards')
    .withIndex('byIsPubliclyListableFeaturedRank', (q) =>
      q.eq('isPubliclyListable', true).eq('featuredRank', target.featuredRank)
    )
    .take(4)
  for (const card of featuredCards)
  {
    const template = await findPublishedTargetTemplateForCard(ctx, card, target)
    if (template) return template
  }

  const cards = await ctx.db
    .query('templateCards')
    .withIndex('byCategoryIsPubliclyListableUpdatedAt', (q) =>
      q.eq('category', target.category).eq('isPubliclyListable', true)
    )
    .order('desc')
    .take(MAX_TARGET_SEARCH_CARDS)
  for (const card of cards)
  {
    const template = await findPublishedTargetTemplateForCard(ctx, card, target)
    if (template) return template
  }

  throw new ConvexError({
    code: CONVEX_ERROR_CODES.notFound,
    message: `seed target template not found: ${target.title}`,
  })
}

export const resolveSeedTargetsImpl = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      key: targetKeyValidator,
      title: v.string(),
      slug: v.string(),
      templateId: v.id('templates'),
      itemCount: v.number(),
    })
  ),
  handler: async (ctx): Promise<SeedTargetResolution[]> =>
    await Promise.all(
      SEED_TARGETS.map(async (target) =>
      {
        const template = await resolveTargetTemplate(ctx, target)
        return {
          key: target.key,
          title: template.title,
          slug: template.slug,
          templateId: template._id,
          itemCount: template.itemCount,
        }
      })
    ),
})

export const resetSeedPairImpl = internalMutation({
  args: {
    targetKey: targetKeyValidator,
    templateId: v.id('templates'),
    profileIndex: v.number(),
  },
  returns: v.object({
    rankingsDeleted: v.number(),
    boardsDeleted: v.number(),
  }),
  handler: async (ctx, args): Promise<SeedResetResult> =>
  {
    const profile = sampleProfileAt(args.profileIndex)
    const user = await findSeedUser(ctx, profile)
    if (!user) return { rankingsDeleted: 0, boardsDeleted: 0 }

    return await deleteSeedPair(
      ctx,
      user,
      args.templateId,
      profile,
      targetDefinitionByKey(args.targetKey)
    )
  },
})

export const seedSampleRankingImpl = internalMutation({
  args: {
    targetKey: targetKeyValidator,
    templateId: v.id('templates'),
    profileIndex: v.number(),
  },
  returns: v.object({
    targetKey: targetKeyValidator,
    templateSlug: v.string(),
    userEmail: v.string(),
    rankingSlug: v.string(),
    boardExternalId: v.string(),
    itemsRanked: v.number(),
    rankingsDeleted: v.number(),
  }),
  handler: async (ctx, args): Promise<SeedRankingResult> =>
  {
    const target = targetDefinitionByKey(args.targetKey)
    const profile = sampleProfileAt(args.profileIndex)
    const template = await ctx.db.get(args.templateId)
    if (!template || !isPublishedTemplateRow(template))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: `seed template missing or unpublished: ${target.title}`,
      })
    }

    const now = Date.now()
    const user = await ensureSeedUser(ctx, profile, now)
    const deleted = await deleteSeedPair(
      ctx,
      user,
      template._id,
      profile,
      target
    )
    const templateItems = (await loadTemplateItems(ctx, template._id)).sort(
      (a, b) => a.order - b.order
    )
    if (templateItems.length === 0)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: `seed template has no items: ${target.title}`,
      })
    }
    assertSeedRowsWithinLimit(
      'template items',
      templateItems,
      MAX_SEED_ROW_ITEMS
    )

    const tiers = resolveTemplateTiers(template)
    assertSeedRowsWithinLimit('template tiers', tiers, MAX_SEED_ROW_TIERS)
    const rankedItems = rankTemplateItems(target, profile, templateItems, tiers)
    const boardExternalId = seedBoardExternalId(profile, target)
    const createdAt =
      now - (args.profileIndex * SEED_TARGETS.length + 1) * HOUR_MS
    const title = seedRankingTitle(profile, target)
    const boardId = await ctx.db.insert('boards', {
      externalId: boardExternalId,
      ownerId: user._id,
      title: normalizeBoardTitle(title),
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      revision: 1,
      sourceTemplateId: template._id,
      sourceTemplateCategory: template.category,
      sourceTemplateSizeClass: template.sizeClass,
      ...buildFreshBoardCloudFields(createdAt),
      itemAspectRatio: template.itemAspectRatio ?? undefined,
      itemAspectRatioMode: template.itemAspectRatioMode ?? undefined,
      defaultItemImageFit: template.defaultItemImageFit ?? undefined,
      labels: template.labels ?? undefined,
      activeItemCount: rankedItems.length,
      unrankedItemCount: 0,
      templateProgressState: resolveTemplateProgressState(template._id, {
        activeItemCount: rankedItems.length,
        unrankedItemCount: 0,
      }),
      librarySummary: EMPTY_BOARD_LIBRARY_SUMMARY,
    })

    const tierEntries = await Promise.all(
      tiers.map(async (tier, order) =>
      {
        const externalId = seedTierExternalId(profile, target, order)
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
          colorSpec: tier.colorSpec,
          rowColorSpec: tier.rowColorSpec,
          name: tier.name,
          description: tier.description ?? null,
        }
      })
    )

    const summaryTiers: BoardLibrarySummaryTier[] = tierEntries.map((tier) => ({
      key: tier.externalId,
      order: tier.order,
      colorSpec: tier.colorSpec,
    }))
    const summaryItems: BoardLibrarySummaryItem[] = await Promise.all(
      rankedItems.map(async (ranked) =>
      {
        const tier = tierEntries[ranked.tierIndex]
        const externalId = seedItemExternalId(profile, target, ranked.item)
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

    const rankingSlug = await allocateRankingSlug(ctx)
    const viewCount = Math.floor(
      unitHash(`views:${profile.key}:${target.key}`) * 24
    )
    const rankingId = await ctx.db.insert('publishedRankings', {
      slug: rankingSlug,
      ownerId: user._id,
      sourceTemplateId: template._id,
      sourceBoardId: boardId,
      sourceTemplateSlug: template.slug,
      sourceTemplateTitle: template.title,
      sourceTemplateCategory: template.category,
      title: normalizeRankingTitle(title),
      description: normalizeRankingDescription(
        'Seeded sample ranking for community feature testing.'
      ),
      visibility: 'public',
      publicationState: 'published',
      isPubliclyListable: true,
      itemCount: rankedItems.length,
      tierCount: tierEntries.length,
      remixCount: 0,
      viewCount,
      topScore: rankingTopScore({ viewCount, remixCount: 0 }),
      isFeatured: false,
      featuredRank: null,
      featuredBadge: null,
      createdAt,
      updatedAt: createdAt,
    })

    await Promise.all([
      ...tierEntries.map((tier) =>
        ctx.db.insert('publishedRankingTiers', {
          rankingId,
          externalId: tier.externalId,
          name: tier.name,
          description: tier.description,
          colorSpec: tier.colorSpec,
          rowColorSpec: tier.rowColorSpec ?? null,
          order: tier.order,
        })
      ),
      ...rankedItems.map((ranked) =>
      {
        const tier = tierEntries[ranked.tierIndex]
        return ctx.db.insert('publishedRankingItems', {
          rankingId,
          templateItemId: ranked.item._id,
          templateItemExternalId: ranked.item.externalId,
          externalId: seedItemExternalId(profile, target, ranked.item),
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
    await adjustTemplateUseCount(ctx, template._id, 1, now)

    return {
      targetKey: target.key,
      templateSlug: template.slug,
      userEmail: seedUserEmail(profile),
      rankingSlug,
      boardExternalId,
      itemsRanked: rankedItems.length,
      rankingsDeleted: deleted.rankingsDeleted,
    }
  },
})

export const queueSeedAggregateRecomputeImpl = internalMutation({
  args: { templateIds: v.array(v.id('templates')) },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> =>
  {
    const uniqueTemplateIds = [...new Set(args.templateIds)]
    const now = Date.now()
    for (const templateId of uniqueTemplateIds)
    {
      await queueTemplateRankingAggregateRecompute(ctx, templateId, now)
    }
    return uniqueTemplateIds.length
  },
})

export const seedSampleCommunityRankings = action({
  args: {
    seedSecret: v.string(),
    reset: v.optional(v.boolean()),
    userCount: v.optional(v.number()),
  },
  returns: seedCommunityRankingsResultValidator,
  handler: async (ctx, args): Promise<SeedCommunityRankingsResult> =>
  {
    requireSeedAuthorized(args.seedSecret)
    const userCount = normalizeUserCount(args.userCount)
    const targets: SeedTargetResolution[] = await ctx.runQuery(
      internal.marketplace.rankings.seed.resolveSeedTargetsImpl,
      {}
    )
    let rankingsDeleted = 0

    if (args.reset)
    {
      for (const target of targets)
      {
        for (
          let profileIndex = 0;
          profileIndex < SAMPLE_PROFILES.length;
          profileIndex++
        )
        {
          const resetResult: SeedResetResult = await ctx.runMutation(
            internal.marketplace.rankings.seed.resetSeedPairImpl,
            {
              targetKey: target.key,
              templateId: target.templateId,
              profileIndex,
            }
          )
          rankingsDeleted += resetResult.rankingsDeleted
          await pauseSeedWrites()
        }
      }
    }

    const targetResults = new Map<TargetKey, SeedTargetResult>(
      targets.map((target) => [
        target.key,
        {
          key: target.key,
          title: target.title,
          slug: target.slug,
          itemCount: target.itemCount,
          rankingsSeeded: 0,
          rankingsDeleted: 0,
        },
      ])
    )

    for (const target of targets)
    {
      const seededSlugsByProfile = new Map<number, string>()
      for (let profileIndex = 0; profileIndex < userCount; profileIndex++)
      {
        const seeded: SeedRankingResult = await ctx.runMutation(
          internal.marketplace.rankings.seed.seedSampleRankingImpl,
          {
            targetKey: target.key,
            templateId: target.templateId,
            profileIndex,
          }
        )
        seededSlugsByProfile.set(profileIndex, seeded.rankingSlug)
        rankingsDeleted += seeded.rankingsDeleted
        const result = targetResults.get(target.key)
        if (result)
        {
          result.rankingsSeeded += 1
          result.rankingsDeleted += seeded.rankingsDeleted
        }
        await pauseSeedWrites()
      }
      for (const featured of FEATURED_PROFILE_BADGES)
      {
        const slug = seededSlugsByProfile.get(featured.profileIndex)
        if (!slug) continue
        await ctx.runMutation(
          internal.marketplace.rankings.mutations.markRankingFeaturedImpl,
          {
            slug,
            featuredRank: featured.featuredRank,
            featuredBadge: featured.featuredBadge,
          }
        )
      }
    }

    const aggregatesQueued: number = await ctx.runMutation(
      internal.marketplace.rankings.seed.queueSeedAggregateRecomputeImpl,
      { templateIds: targets.map((target) => target.templateId) }
    )
    const targetsOut = targets.map((target) => targetResults.get(target.key)!)

    return {
      usersSeeded: userCount,
      rankingsSeeded: userCount * targets.length,
      rankingsDeleted,
      aggregatesQueued,
      targets: targetsOut,
    }
  },
})
