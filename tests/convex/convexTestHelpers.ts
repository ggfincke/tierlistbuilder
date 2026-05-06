// tests/convex/convexTestHelpers.ts
// shared Convex test harness setup

import type { Id, Doc } from '@convex/_generated/dataModel'
import type { MutationCtx } from '@convex/_generated/server'
import { buildSearchText } from '@convex/marketplace/templates/lib'
import { buildFreshBoardCloudFields } from '@convex/workspace/boards/cloudFields'

export const modules = import.meta.glob('../../convex/**/*.*s')

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
  tierCount?: number
  remixCount?: number
  viewCount?: number
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
  return await ctx.db.insert('publishedRankings', {
    slug: args.slug,
    ownerId: args.ownerId,
    sourceTemplateId: args.sourceTemplateId,
    sourceBoardId: args.sourceBoardId,
    sourceTemplateSlug: args.sourceTemplateSlug,
    sourceTemplateTitle: args.sourceTemplateTitle,
    sourceTemplateCategory: args.sourceTemplateCategory ?? 'gaming',
    title: args.title,
    description: args.description ?? null,
    visibility: args.visibility ?? 'public',
    publicationState: args.publicationState ?? 'published',
    isPubliclyListable: args.isPubliclyListable ?? true,
    itemCount: args.itemCount,
    tierCount: args.tierCount ?? 1,
    remixCount: args.remixCount ?? 0,
    viewCount: args.viewCount ?? 0,
    createdAt: now,
    updatedAt: now,
  })
}
