// tests/convex/convexTestHelpers.ts
// shared Convex test harness setup

import type { Id, Doc } from '@convex/_generated/dataModel'
import type { MutationCtx } from '@convex/_generated/server'
import rateLimiter from '@convex-dev/rate-limiter/test'
import { convexTest } from 'convex-test'
import { ConvexError } from 'convex/values'
import { expect, vi } from 'vitest'
import schema from '../../convex/schema'
import {
  buildDefaultTemplateCriteria,
  buildDefaultTemplateCriterionSnapshot,
} from '@convex/marketplace/templates/criteria'
import {
  SEED_ENABLED_ENV,
  SEED_SECRET_ENV,
} from '../../convex/marketplace/seedAuth'
import { buildSearchText } from '@convex/marketplace/templates/lib/normalize'
import { buildFreshBoardCloudFields } from '@convex/workspace/boards/cloudFields'
import {
  boardSourceTemplateFromTemplate,
  EMPTY_BOARD_SOURCE_RANKING,
  EMPTY_BOARD_SOURCE_TEMPLATE,
  type BoardSourceTemplate,
} from '@convex/workspace/boards/sourceFields'
import { RANKING_TOP_SCORE_REMIX_WEIGHT } from '@tierlistbuilder/contracts/marketplace/ranking'
import type {
  MarketplaceTemplateCriterion,
  MarketplaceTemplateCriterionSnapshot,
} from '@tierlistbuilder/contracts/marketplace/templateCriterion'

const modules = import.meta.glob('../../convex/**/*.*s')

export type ConvexTestHandle = ReturnType<typeof convexTest<typeof schema>>

export const makeTest = (): ConvexTestHandle =>
  convexTest({ schema, modules, transactionLimits: true })

export const makeRateLimitedTest = (): ConvexTestHandle =>
{
  const t = makeTest()
  rateLimiter.register(t)
  return t
}

export const asUser = (
  t: ConvexTestHandle,
  userId: Id<'users'>,
  sessionId: string | Id<'authSessions'> = 'test-session'
): ReturnType<ConvexTestHandle['withIdentity']> =>
  t.withIdentity({
    subject: `${userId}|${sessionId}`,
    issuer: 'https://convex.test',
  })

export const expectConvexCode = async (
  promise: Promise<unknown>,
  code: string
): Promise<void> =>
{
  await expect(promise).rejects.toSatisfy(
    (error: unknown) =>
      error instanceof ConvexError &&
      typeof error.data === 'object' &&
      error.data !== null &&
      'code' in error.data &&
      error.data.code === code
  )
}

export const withFakeTimers = async <T>(run: () => Promise<T>): Promise<T> =>
{
  vi.useFakeTimers()
  try
  {
    return await run()
  }
  finally
  {
    vi.useRealTimers()
  }
}

export const runScheduled = async (t: ConvexTestHandle): Promise<void> =>
  await t.finishAllScheduledFunctions(() => vi.runAllTimers())

export const TEST_CRITERIA: MarketplaceTemplateCriterion[] = [
  {
    externalId: 'competitive',
    name: 'Competitive',
    shortName: 'Comp',
    prompt: 'Rank by competitive viability.',
    axisTop: 'Strongest',
    axisBottom: 'Weakest',
    order: 0,
    isPrimary: true,
    status: 'active',
  },
  {
    externalId: 'favorites',
    name: 'Favorites',
    shortName: 'Favs',
    prompt: 'Rank by personal preference.',
    axisTop: 'Favorite',
    axisBottom: 'Least favorite',
    order: 1,
    isPrimary: false,
    status: 'active',
  },
  {
    externalId: 'staged',
    name: 'Staged',
    shortName: null,
    prompt: 'Hidden staging question.',
    axisTop: null,
    axisBottom: null,
    order: 2,
    isPrimary: false,
    status: 'hidden',
  },
  {
    externalId: 'retired',
    name: 'Retired',
    shortName: null,
    prompt: 'Retired historical question.',
    axisTop: null,
    axisBottom: null,
    order: 3,
    isPrimary: false,
    status: 'deprecated',
  },
]

export const toCriterionSnapshot = (
  externalId = 'competitive'
): MarketplaceTemplateCriterionSnapshot =>
{
  const criterion = TEST_CRITERIA.find((item) => item.externalId === externalId)
  if (!criterion) throw new Error(`missing test criterion: ${externalId}`)
  return {
    externalId: criterion.externalId,
    name: criterion.name,
    prompt: criterion.prompt,
  }
}

export function seedUser(
  t: ConvexTestHandle,
  email?: string,
  patch?: Partial<Doc<'users'>>
): Promise<Id<'users'>>
export function seedUser(
  t: ConvexTestHandle,
  name: string,
  email: string,
  plan?: Doc<'users'>['plan']
): Promise<Id<'users'>>
export async function seedUser(
  t: ConvexTestHandle,
  emailOrName: string = `user-${Math.random().toString(36).slice(2)}@example.com`,
  patchOrEmail: Partial<Doc<'users'>> | string = {},
  plan: Doc<'users'>['plan'] = 'free'
): Promise<Id<'users'>>
{
  const isNamedUser = typeof patchOrEmail === 'string'
  const email = isNamedUser ? patchOrEmail : emailOrName
  const patch: Partial<Doc<'users'>> = isNamedUser
    ? { name: emailOrName, displayName: emailOrName, plan }
    : patchOrEmail
  return await t.run(async (ctx) =>
  {
    const now = Date.now()
    return await ctx.db.insert('users', {
      name: email,
      displayName: email,
      email,
      createdAt: now,
      updatedAt: now,
      plan: 'free',
      ...patch,
    })
  })
}

export const buildPngHeader = (width: number, height: number): Uint8Array =>
{
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8)
  bytes.set([0x49, 0x48, 0x44, 0x52], 12)
  bytes[16] = (width >>> 24) & 0xff
  bytes[17] = (width >>> 16) & 0xff
  bytes[18] = (width >>> 8) & 0xff
  bytes[19] = width & 0xff
  bytes[20] = (height >>> 24) & 0xff
  bytes[21] = (height >>> 16) & 0xff
  bytes[22] = (height >>> 8) & 0xff
  bytes[23] = height & 0xff
  return bytes
}

interface SeedTileMediaAssetArgs
{
  ownerId: Id<'users'>
  externalId: string
  contentHash: string
  dedupeHash?: string
  storageId?: Id<'_storage'>
  blob?: Blob
  width?: number
  height?: number
  byteSize?: number
  mimeType?: string
  createdAt?: number
}

export const seedTileMediaAsset = async (
  ctx: MutationCtx,
  args: SeedTileMediaAssetArgs
): Promise<{
  mediaAssetId: Id<'mediaAssets'>
  mediaVariantId: Id<'mediaVariants'>
  storageId: Id<'_storage'>
}> =>
{
  const mimeType = args.mimeType ?? 'image/png'
  const storageId =
    args.storageId ??
    (await ctx.storage.store(
      args.blob ?? new Blob([new Uint8Array([1, 2, 3])], { type: mimeType })
    ))
  const now = args.createdAt ?? Date.now()
  const tileVariant = {
    storageId,
    width: args.width ?? 32,
    height: args.height ?? 32,
    byteSize: args.byteSize ?? 3,
    mimeType,
    contentHash: args.contentHash,
  }
  const mediaAssetId = await ctx.db.insert('mediaAssets', {
    ownerId: args.ownerId,
    externalId: args.externalId,
    dedupeHash: args.dedupeHash ?? args.contentHash,
    tileVariant,
    createdAt: now,
  })
  const mediaVariantId = await ctx.db.insert('mediaVariants', {
    mediaAssetId,
    kind: 'tile',
    ...tileVariant,
    createdAt: now,
  })
  return { mediaAssetId, mediaVariantId, storageId }
}

interface SeedEnvSnapshot
{
  enabled: string | undefined
  secret: string | undefined
}

export const captureSeedEnv = (): SeedEnvSnapshot => ({
  enabled: process.env[SEED_ENABLED_ENV],
  secret: process.env[SEED_SECRET_ENV],
})

export const restoreSeedEnv = (snapshot: SeedEnvSnapshot): void =>
{
  if (snapshot.enabled === undefined) delete process.env[SEED_ENABLED_ENV]
  else process.env[SEED_ENABLED_ENV] = snapshot.enabled

  if (snapshot.secret === undefined) delete process.env[SEED_SECRET_ENV]
  else process.env[SEED_SECRET_ENV] = snapshot.secret
}

export const enableSeedApi = (secret: string): void =>
{
  process.env[SEED_ENABLED_ENV] = 'true'
  process.env[SEED_SECRET_ENV] = secret
}

export const withSeedEnv = async <T>(
  secret: string,
  run: () => Promise<T>
): Promise<T> =>
{
  const snapshot = captureSeedEnv()
  enableSeedApi(secret)
  try
  {
    return await run()
  }
  finally
  {
    restoreSeedEnv(snapshot)
  }
}

interface SeedPublishedTemplateArgs
{
  authorId: Id<'users'>
  slug: string
  title: string
  itemCount: number
  sizeClass: Doc<'templates'>['sizeClass']
  category?: Doc<'templates'>['category']
  tags?: string[]
  sourceBoardId?: Id<'boards'> | null
  criteria?: Doc<'templates'>['criteria']
  now?: number
}

interface SeedCloudBoardArgs
{
  ownerId: Id<'users'>
  externalId: string
  title: string
  now?: number
  sourceTemplateId?: Id<'templates'> | null
  sourceTemplateCategory?: BoardSourceTemplate['category']
  sourceTemplateSizeClass?: BoardSourceTemplate['sizeClass']
  sourceTemplateTitle?: string | null
  activeItemCount?: number
  unrankedItemCount?: number
  templateProgressState?: Doc<'boards'>['templateProgressState']
  librarySummary?: Doc<'boards'>['librarySummary']
  revision?: number
  itemAspectRatio?: number
  itemAspectRatioMode?: Doc<'boards'>['itemAspectRatioMode']
  defaultItemImageFit?: Doc<'boards'>['defaultItemImageFit']
  defaultItemImagePadding?: Doc<'boards'>['defaultItemImagePadding']
  labels?: Doc<'boards'>['labels']
}

interface SeedPublishedRankingArgs
{
  ownerId: Id<'users'>
  slug: string
  sourceTemplateId: Id<'templates'>
  sourceBoardId: Id<'boards'> | null
  sourceTemplateSlug: string
  sourceTemplateTitle: string
  title: string
  itemCount: number
  now?: number
  sourceTemplateCategory?: Doc<'publishedRankings'>['sourceTemplateCategory']
  description?: string | null
  visibility?: Doc<'publishedRankings'>['visibility']
  publicationState?: Doc<'publishedRankings'>['publicationState']
  isPubliclyListable?: boolean
  supersededAt?: number | null
  supersededByRankingId?: Id<'publishedRankings'> | null
  tierCount?: number
  remixCount?: number
  viewCount?: number
  isFeatured?: boolean
  featuredRank?: number
  featuredBadge?: Doc<'publishedRankings'>['featuredBadge']
  criterion?: MarketplaceTemplateCriterionSnapshot
}

const defaultSuggestedTiers = (): Doc<'templates'>['suggestedTiers'] => [
  { name: 'S', colorSpec: { kind: 'palette', index: 0 } },
]

const defaultBoardLibrarySummary = (): Doc<'boards'>['librarySummary'] => ({
  coverItems: [],
  tierCount: 1,
  tierColors: [{ kind: 'palette', index: 0 }],
  tierBreakdown: [],
})

export const seedPublishedTemplate = async (
  ctx: MutationCtx,
  args: SeedPublishedTemplateArgs
): Promise<Id<'templates'>> =>
{
  const now = args.now ?? Date.now()
  const category = args.category ?? 'gaming'
  const tags = args.tags ?? []
  const author = await ctx.db.get(args.authorId)
  if (!author) throw new Error('template author missing')
  const authorDisplayName =
    author.displayName ?? author.name ?? 'Template Author'
  const templateId = await ctx.db.insert('templates', {
    slug: args.slug,
    authorId: args.authorId,
    title: args.title,
    description: null,
    category,
    tags,
    visibility: 'public',
    coverMediaAssetId: null,
    coverFraming: null,
    coverItems: [],
    suggestedTiers: defaultSuggestedTiers(),
    criteria: args.criteria ?? buildDefaultTemplateCriteria(),
    sourceBoardId: args.sourceBoardId ?? null,
    sizeClass: args.sizeClass,
    publicationState: 'published',
    isPubliclyListable: true,
    itemCount: args.itemCount,
    featuredRank: null,
    creditLine: null,
    itemAspectRatio: null,
    itemAspectRatioMode: null,
    defaultItemImageFit: null,
    defaultItemImagePadding: null,
    labels: null,
    createdAt: now,
    updatedAt: now,
  })
  await ctx.db.insert('templateStats', {
    templateId,
    forkCount: 0,
    viewCount: 0,
    updatedAt: now,
  })
  await ctx.db.insert('templateCards', {
    templateId,
    slug: args.slug,
    title: args.title,
    description: null,
    category,
    tags,
    visibility: 'public',
    publicationState: 'published',
    isPubliclyListable: true,
    itemCount: args.itemCount,
    sizeClass: args.sizeClass,
    authorId: args.authorId,
    authorExternalId: author.externalId ?? args.authorId,
    authorDisplayName,
    authorImageUrl: author.image ?? null,
    authorAvatarStorageId: author.avatarStorageId ?? null,
    coverMedia: null,
    coverFraming: null,
    coverItems: [],
    itemAspectRatio: null,
    defaultItemImageFit: null,
    defaultItemImagePadding: null,
    featuredRank: null,
    forkCount: 0,
    viewCount: 0,
    rankingCount: 0,
    weeklyForkCount: 0,
    weeklyViewCount: 0,
    trendingScore: 0,
    trendingComputedAt: null,
    creditLine: null,
    searchText: buildSearchText({
      title: args.title,
      description: null,
      category,
      tags,
      authorDisplayName,
    }),
    createdAt: now,
    updatedAt: now,
  })
  return templateId
}

export const seedCloudBoard = async (
  ctx: MutationCtx,
  args: SeedCloudBoardArgs
): Promise<Id<'boards'>> =>
{
  const now = args.now ?? Date.now()
  return await ctx.db.insert('boards', {
    externalId: args.externalId,
    ownerId: args.ownerId,
    title: args.title,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    revision: args.revision ?? 1,
    itemAspectRatio: args.itemAspectRatio ?? null,
    itemAspectRatioMode: args.itemAspectRatioMode ?? null,
    aspectRatioPromptDismissed: false,
    defaultItemImageFit: args.defaultItemImageFit ?? null,
    defaultItemImagePadding: args.defaultItemImagePadding ?? null,
    sourceTemplate: args.sourceTemplateId
      ? boardSourceTemplateFromTemplate({
          _id: args.sourceTemplateId,
          category: args.sourceTemplateCategory ?? null,
          sizeClass: args.sourceTemplateSizeClass ?? null,
          title: args.sourceTemplateTitle ?? null,
        })
      : EMPTY_BOARD_SOURCE_TEMPLATE,
    sourceRanking: EMPTY_BOARD_SOURCE_RANKING,
    forkCounted: Boolean(args.sourceTemplateId),
    preferredCriterionExternalId: null,
    ...buildFreshBoardCloudFields(now),
    activeItemCount: args.activeItemCount ?? 0,
    unrankedItemCount: args.unrankedItemCount ?? 0,
    templateProgressState: args.templateProgressState ?? 'none',
    librarySummary: args.librarySummary ?? defaultBoardLibrarySummary(),
    paletteId: null,
    textStyleId: null,
    pageBackground: null,
    labels: args.labels ?? null,
    seedDatasetKey: null,
    seedReleaseId: null,
    seedExternalId: null,
    seedContentHash: null,
    seedKind: null,
    seedReleaseStatus: null,
  })
}

export const seedPublishedRanking = async (
  ctx: MutationCtx,
  args: SeedPublishedRankingArgs
): Promise<Id<'publishedRankings'>> =>
{
  const now = args.now ?? Date.now()
  const criterion = args.criterion ?? buildDefaultTemplateCriterionSnapshot()
  return await ctx.db.insert('publishedRankings', {
    slug: args.slug,
    ownerId: args.ownerId,
    sourceTemplateId: args.sourceTemplateId,
    sourceBoardId: args.sourceBoardId,
    sourceTemplateSlug: args.sourceTemplateSlug,
    sourceTemplateTitle: args.sourceTemplateTitle,
    sourceTemplateCategory: args.sourceTemplateCategory ?? 'gaming',
    sourceCriterionExternalId: criterion.externalId,
    sourceCriterionNameSnapshot: criterion.name,
    sourceCriterionPromptSnapshot: criterion.prompt,
    title: args.title,
    description: args.description ?? null,
    visibility: args.visibility ?? 'public',
    publicationState: args.publicationState ?? 'published',
    isPubliclyListable: args.isPubliclyListable ?? true,
    supersededAt: args.supersededAt ?? null,
    supersededByRankingId: args.supersededByRankingId ?? null,
    itemCount: args.itemCount,
    tierCount: args.tierCount ?? 1,
    remixCount: args.remixCount ?? 0,
    viewCount: args.viewCount ?? 0,
    topScore:
      (args.viewCount ?? 0) +
      (args.remixCount ?? 0) * RANKING_TOP_SCORE_REMIX_WEIGHT,
    isFeatured: args.isFeatured ?? false,
    featuredRank: args.featuredRank ?? null,
    featuredBadge: args.featuredBadge ?? null,
    seedDatasetKey: null,
    seedReleaseId: null,
    seedExternalId: null,
    seedKind: null,
    seedTemplateExternalId: null,
    seedCriterionExternalId: null,
    seedAuthorKey: null,
    seedProfileKey: null,
    seedCuratedExternalId: null,
    seedReleaseStatus: null,
    createdAt: now,
    updatedAt: now,
  })
}
