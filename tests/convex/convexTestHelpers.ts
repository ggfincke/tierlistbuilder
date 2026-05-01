// tests/convex/convexTestHelpers.ts
// shared Convex test harness setup

import type { Id, Doc } from '@convex/_generated/dataModel'
import type { MutationCtx } from '@convex/_generated/server'
import { buildSearchText } from '@convex/marketplace/templates/lib'

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

const defaultSuggestedTiers = (): Doc<'templates'>['suggestedTiers'] => [
  { name: 'S', colorSpec: { kind: 'palette', index: 0 } },
]

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
