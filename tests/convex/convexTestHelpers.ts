// tests/convex/convexTestHelpers.ts
// shared Convex test harness setup

import type { Id, Doc } from '@convex/_generated/dataModel'
import type { MutationCtx } from '@convex/_generated/server'
import type { convexTest } from 'convex-test'
import type schema from '../../convex/schema'
import {
  buildDefaultTemplateCriteria,
  buildDefaultTemplateCriterionSnapshot,
} from '@convex/marketplace/templates/criteria'
import {
  SEED_ENABLED_ENV,
  SEED_SECRET_ENV,
} from '../../convex/marketplace/seedAuth'
import { buildSearchText } from '@convex/marketplace/templates/lib'
import { buildFreshBoardCloudFields } from '@convex/workspace/boards/cloudFields'
import { RANKING_TOP_SCORE_REMIX_WEIGHT } from '@tierlistbuilder/contracts/marketplace/ranking'
import type { MarketplaceTemplateCriterionSnapshot } from '@tierlistbuilder/contracts/marketplace/templateCriterion'

export const modules = import.meta.glob('../../convex/**/*.*s')

type ConvexTestHandle = ReturnType<typeof convexTest<typeof schema>>

export const seedUser = async (
  t: ConvexTestHandle,
  email: string = `user-${Math.random().toString(36).slice(2)}@example.com`,
  patch: Partial<Doc<'users'>> = {}
): Promise<Id<'users'>> =>
  await t.run(async (ctx) =>
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

export interface SeedEnvSnapshot
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
  sourceTemplateCategory?: Doc<'boards'>['sourceTemplateCategory']
  sourceTemplateSizeClass?: Doc<'boards'>['sourceTemplateSizeClass']
  activeItemCount?: number
  unrankedItemCount?: number
  templateProgressState?: Doc<'boards'>['templateProgressState']
  librarySummary?: Doc<'boards'>['librarySummary']
  revision?: number
  itemAspectRatio?: number
  itemAspectRatioMode?: Doc<'boards'>['itemAspectRatioMode']
  defaultItemImageFit?: Doc<'boards'>['defaultItemImageFit']
  labels?: Doc<'boards'>['labels']
}

interface SeedPublishedRankingArgs
{
  ownerId: Id<'users'>
  slug: string
  sourceTemplateId: Id<'templates'>
  sourceBoardId: Id<'boards'>
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
    createdAt: now,
    updatedAt: now,
  })
  await ctx.db.insert('templateStats', {
    templateId,
    useCount: 0,
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
    coverItems: [],
    itemAspectRatio: null,
    defaultItemImageFit: null,
    featuredRank: null,
    useCount: 0,
    viewCount: 0,
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
    ...(args.itemAspectRatio !== undefined
      ? { itemAspectRatio: args.itemAspectRatio }
      : {}),
    ...(args.itemAspectRatioMode !== undefined
      ? { itemAspectRatioMode: args.itemAspectRatioMode }
      : {}),
    ...(args.defaultItemImageFit !== undefined
      ? { defaultItemImageFit: args.defaultItemImageFit }
      : {}),
    ...(args.labels !== undefined ? { labels: args.labels } : {}),
    sourceTemplateId: args.sourceTemplateId ?? null,
    sourceTemplateCategory: args.sourceTemplateCategory ?? null,
    sourceTemplateSizeClass: args.sourceTemplateSizeClass ?? null,
    ...buildFreshBoardCloudFields(now),
    activeItemCount: args.activeItemCount ?? 0,
    unrankedItemCount: args.unrankedItemCount ?? 0,
    templateProgressState: args.templateProgressState ?? 'none',
    librarySummary: args.librarySummary ?? defaultBoardLibrarySummary(),
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
    createdAt: now,
    updatedAt: now,
  })
}
