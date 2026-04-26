// convex/marketplace/templates/lib.ts
// shared template marketplace projection, validation, & cloning helpers

import { ConvexError } from 'convex/values'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import {
  generateItemId,
  generateMediaAssetExternalId,
  generateTierId,
} from '@tierlistbuilder/contracts/lib/ids'
import type { TierPresetTier } from '@tierlistbuilder/contracts/workspace/tierPreset'
import type {
  MarketplaceTemplateDetail,
  MarketplaceTemplateItem,
  MarketplaceTemplateSummary,
  TemplateCategory,
  TemplateMediaRef,
} from '@tierlistbuilder/contracts/marketplace/template'
import {
  DEFAULT_TEMPLATE_LIST_LIMIT,
  generateTemplateSlug,
  MAX_TEMPLATE_CREDIT_LINE_LENGTH,
  MAX_TEMPLATE_DESCRIPTION_LENGTH,
  MAX_TEMPLATE_LIST_LIMIT,
  MAX_TEMPLATE_TAG_LENGTH,
  MAX_TEMPLATE_TAGS,
  MAX_TEMPLATE_TITLE_LENGTH,
} from '@tierlistbuilder/contracts/marketplace/template'
import { MAX_CLOUD_BOARD_ITEMS } from '@tierlistbuilder/contracts/workspace/cloudBoard'
import { DEFAULT_BOARD_TITLE } from '@tierlistbuilder/contracts/workspace/board'
import { validateHexColor } from '../../lib/hexColor'

type DbCtx = QueryCtx | MutationCtx

const MAX_SEARCH_QUERY_LENGTH = 120
const MAX_SLUG_ATTEMPTS = 8

export const DEFAULT_TEMPLATE_TIERS: readonly TierPresetTier[] = [
  { name: 'S', colorSpec: { kind: 'palette', index: 0 } },
  { name: 'A', colorSpec: { kind: 'palette', index: 1 } },
  { name: 'B', colorSpec: { kind: 'palette', index: 2 } },
  { name: 'C', colorSpec: { kind: 'palette', index: 3 } },
  { name: 'D', colorSpec: { kind: 'palette', index: 4 } },
  { name: 'E', colorSpec: { kind: 'palette', index: 5 } },
]

export const failInput = (message: string): never =>
{
  throw new ConvexError({
    code: CONVEX_ERROR_CODES.invalidInput,
    message,
  })
}

const failState = (message: string): never =>
{
  throw new ConvexError({
    code: CONVEX_ERROR_CODES.invalidState,
    message,
  })
}

export const normalizeTemplateTitle = (raw: string): string =>
{
  const title = raw.trim()
  if (!title)
  {
    failInput('template title is required')
  }
  if (title.length > MAX_TEMPLATE_TITLE_LENGTH)
  {
    failInput(
      `template title too long: ${title.length} exceeds ${MAX_TEMPLATE_TITLE_LENGTH}`
    )
  }
  return title
}

export const normalizeNullableText = (
  raw: string | null | undefined,
  maxLength: number,
  field: string
): string | null =>
{
  const value = raw?.trim() ?? ''
  if (!value)
  {
    return null
  }
  if (value.length > maxLength)
  {
    failInput(`${field} too long: ${value.length} exceeds ${maxLength}`)
  }
  return value
}

export const normalizeDescription = (
  raw: string | null | undefined
): string | null =>
  normalizeNullableText(raw, MAX_TEMPLATE_DESCRIPTION_LENGTH, 'description')

export const normalizeCreditLine = (
  raw: string | null | undefined
): string | null =>
  normalizeNullableText(raw, MAX_TEMPLATE_CREDIT_LINE_LENGTH, 'creditLine')

export const normalizeTags = (rawTags: readonly string[]): string[] =>
{
  const tags: string[] = []
  const seen = new Set<string>()

  for (const raw of rawTags)
  {
    const tag = raw.trim().toLowerCase()
    if (!tag || seen.has(tag))
    {
      continue
    }
    if (tag.length > MAX_TEMPLATE_TAG_LENGTH)
    {
      failInput(
        `template tag too long: ${tag.length} exceeds ${MAX_TEMPLATE_TAG_LENGTH}`
      )
    }
    seen.add(tag)
    tags.push(tag)
  }

  if (tags.length > MAX_TEMPLATE_TAGS)
  {
    failInput(
      `too many template tags: ${tags.length} exceeds ${MAX_TEMPLATE_TAGS}`
    )
  }

  return tags
}

export const normalizeSearchQuery = (
  raw: string | null | undefined
): string | null =>
{
  const query = raw?.trim() ?? ''
  if (!query)
  {
    return null
  }
  return query.slice(0, MAX_SEARCH_QUERY_LENGTH)
}

export const normalizeListLimit = (raw: number | undefined): number =>
{
  if (raw === undefined)
  {
    return DEFAULT_TEMPLATE_LIST_LIMIT
  }
  if (!Number.isFinite(raw) || raw < 1)
  {
    failInput('template list limit must be a positive number')
  }
  return Math.min(Math.floor(raw), MAX_TEMPLATE_LIST_LIMIT)
}

export const buildSearchText = (fields: {
  title: string
  description: string | null
  category: TemplateCategory
  tags: readonly string[]
  authorDisplayName: string
}): string =>
  [
    fields.title,
    fields.description ?? '',
    fields.category,
    fields.tags.join(' '),
    fields.authorDisplayName,
  ]
    .join(' ')
    .toLowerCase()

export const allocateTemplateSlug = async (ctx: DbCtx): Promise<string> =>
{
  for (let i = 0; i < MAX_SLUG_ATTEMPTS; i++)
  {
    const slug = generateTemplateSlug()
    const existing = await ctx.db
      .query('templates')
      .withIndex('bySlug', (q) => q.eq('slug', slug))
      .unique()

    if (!existing)
    {
      return slug
    }
  }

  throw new ConvexError({
    code: CONVEX_ERROR_CODES.slugAllocationFailed,
    message: 'failed to allocate a unique template slug',
  })
}

export const tiersFromBoardRows = (
  tiers: readonly Doc<'boardTiers'>[]
): TierPresetTier[] =>
{
  const suggested = tiers
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((tier) => ({
      name: tier.name,
      description: tier.description,
      colorSpec: tier.colorSpec,
      rowColorSpec: tier.rowColorSpec,
    }))

  return suggested.length > 0 ? suggested : [...DEFAULT_TEMPLATE_TIERS]
}

export const validateTemplateTiers = (
  tiers: readonly TierPresetTier[]
): void =>
{
  for (const tier of tiers)
  {
    if (!tier.name.trim())
    {
      failInput('template tier name is required')
    }
    if (tier.colorSpec.kind === 'custom')
    {
      validateHexColor(tier.colorSpec.hex, 'tier.colorSpec.hex')
    }
    if (tier.rowColorSpec?.kind === 'custom')
    {
      validateHexColor(tier.rowColorSpec.hex, 'tier.rowColorSpec.hex')
    }
  }
}

export const loadTemplateItems = async (
  ctx: DbCtx,
  templateId: Id<'templates'>
): Promise<Doc<'templateItems'>[]> =>
{
  const items = await ctx.db
    .query('templateItems')
    .withIndex('byTemplate', (q) => q.eq('templateId', templateId))
    .take(MAX_CLOUD_BOARD_ITEMS + 1)

  if (items.length > MAX_CLOUD_BOARD_ITEMS)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.syncLimitExceeded,
      message: `template item rows exceed ${MAX_CLOUD_BOARD_ITEMS}`,
    })
  }

  return items
}

export const toTemplateMediaRef = async (
  ctx: DbCtx,
  mediaAssetId: Id<'mediaAssets'> | null
): Promise<TemplateMediaRef | null> =>
{
  if (!mediaAssetId)
  {
    return null
  }

  const asset = await ctx.db.get(mediaAssetId)
  if (!asset)
  {
    return failState(`dangling template media reference: ${mediaAssetId}`)
  }

  const url = await ctx.storage.getUrl(asset.storageId)
  if (!url)
  {
    return null
  }

  return {
    externalId: asset.externalId,
    contentHash: asset.contentHash,
    url,
    width: asset.width,
    height: asset.height,
    mimeType: asset.mimeType,
  }
}

export const toTemplateAuthor = async (
  ctx: DbCtx,
  authorId: Id<'users'>
): Promise<MarketplaceTemplateSummary['author']> =>
{
  const author = await ctx.db.get(authorId)
  if (!author)
  {
    return failState(`template author missing: ${authorId}`)
  }

  const avatarUrl =
    author.image ??
    (author.avatarStorageId
      ? await ctx.storage.getUrl(author.avatarStorageId)
      : null)

  return {
    id: author.externalId ?? author._id,
    displayName:
      author.displayName ?? author.name ?? author.email ?? 'Tier list creator',
    avatarUrl,
  }
}

export const toTemplateSummary = async (
  ctx: DbCtx,
  template: Doc<'templates'>
): Promise<MarketplaceTemplateSummary> =>
{
  const [author, coverMedia] = await Promise.all([
    toTemplateAuthor(ctx, template.authorId),
    toTemplateMediaRef(ctx, template.coverMediaAssetId),
  ])

  return {
    slug: template.slug,
    title: template.title,
    description: template.description,
    category: template.category,
    tags: template.tags,
    visibility: template.visibility,
    author,
    coverMedia,
    itemCount: template.itemCount,
    useCount: template.useCount,
    viewCount: template.viewCount,
    featuredRank: template.featuredRank,
    creditLine: template.creditLine,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    unpublishedAt: template.unpublishedAt,
  }
}

export const toTemplateDetail = async (
  ctx: DbCtx,
  template: Doc<'templates'>
): Promise<MarketplaceTemplateDetail> =>
{
  const [summary, items] = await Promise.all([
    toTemplateSummary(ctx, template),
    loadTemplateItems(ctx, template._id),
  ])

  const mediaRefs = new Map<Id<'mediaAssets'>, TemplateMediaRef | null>()
  for (const item of items)
  {
    if (!item.mediaAssetId || mediaRefs.has(item.mediaAssetId))
    {
      continue
    }
    mediaRefs.set(
      item.mediaAssetId,
      await toTemplateMediaRef(ctx, item.mediaAssetId)
    )
  }

  const projectedItems: MarketplaceTemplateItem[] = items.map((item) => ({
    externalId: item.externalId,
    label: item.label,
    backgroundColor: item.backgroundColor,
    altText: item.altText,
    media: item.mediaAssetId
      ? (mediaRefs.get(item.mediaAssetId) ?? null)
      : null,
    order: item.order,
    aspectRatio: item.aspectRatio,
    imageFit: item.imageFit,
    transform: item.transform,
  }))

  return {
    ...summary,
    suggestedTiers: template.suggestedTiers,
    items: projectedItems,
  }
}

export const findTemplateBySlug = async (
  ctx: DbCtx,
  slug: string
): Promise<Doc<'templates'> | null> =>
  await ctx.db
    .query('templates')
    .withIndex('bySlug', (q) => q.eq('slug', slug))
    .unique()

export const requireOwnedTemplate = async (
  ctx: DbCtx,
  slug: string,
  userId: Id<'users'>
): Promise<Doc<'templates'>> =>
{
  const template = await findTemplateBySlug(ctx, slug)
  if (!template)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.notFound,
      message: 'template not found',
    })
  }
  if (template.authorId !== userId)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.forbidden,
      message: 'not the owner of this template',
    })
  }
  return template
}

export const ensureUserMediaAlias = async (
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  sourceMediaAssetId: Id<'mediaAssets'>
): Promise<Id<'mediaAssets'>> =>
{
  const source = await ctx.db.get(sourceMediaAssetId)
  if (!source)
  {
    return failState(`source template media missing: ${sourceMediaAssetId}`)
  }

  const existing = await ctx.db
    .query('mediaAssets')
    .withIndex('byOwnerAndHash', (q) =>
      q.eq('ownerId', ownerId).eq('contentHash', source.contentHash)
    )
    .unique()

  if (existing)
  {
    return existing._id
  }

  return await ctx.db.insert('mediaAssets', {
    ownerId,
    externalId: generateMediaAssetExternalId(),
    storageId: source.storageId,
    contentHash: source.contentHash,
    mimeType: source.mimeType,
    width: source.width,
    height: source.height,
    byteSize: source.byteSize,
    createdAt: Date.now(),
  })
}

export const templateTitleToBoardTitle = (title: string): string =>
  title.trim() || DEFAULT_BOARD_TITLE

export const insertBoardTiers = async (
  ctx: MutationCtx,
  boardId: Id<'boards'>,
  tiers: readonly TierPresetTier[]
): Promise<Id<'boardTiers'>[]> =>
  await Promise.all(
    tiers.map((tier, order) =>
      ctx.db.insert('boardTiers', {
        boardId,
        externalId: generateTierId(),
        name: tier.name,
        description: tier.description,
        colorSpec: tier.colorSpec,
        rowColorSpec: tier.rowColorSpec,
        order,
      })
    )
  )

export const insertBoardItemsFromTemplate = async (
  ctx: MutationCtx,
  boardId: Id<'boards'>,
  ownerId: Id<'users'>,
  templateItems: readonly Doc<'templateItems'>[]
): Promise<void> =>
{
  const mediaAliases = new Map<Id<'mediaAssets'>, Id<'mediaAssets'>>()
  for (const item of templateItems)
  {
    if (!item.mediaAssetId || mediaAliases.has(item.mediaAssetId))
    {
      continue
    }
    mediaAliases.set(
      item.mediaAssetId,
      await ensureUserMediaAlias(ctx, ownerId, item.mediaAssetId)
    )
  }

  await Promise.all(
    templateItems.map((item) =>
      ctx.db.insert('boardItems', {
        boardId,
        tierId: null,
        externalId: generateItemId(),
        label: item.label ?? undefined,
        backgroundColor: item.backgroundColor ?? undefined,
        altText: item.altText ?? undefined,
        mediaAssetId: item.mediaAssetId
          ? (mediaAliases.get(item.mediaAssetId) ?? null)
          : null,
        order: item.order,
        deletedAt: null,
        aspectRatio: item.aspectRatio ?? undefined,
        imageFit: item.imageFit ?? undefined,
        transform: item.transform ?? undefined,
        templateItemId: item._id,
      })
    )
  )
}
