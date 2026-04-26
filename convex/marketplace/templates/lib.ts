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
  MarketplaceTemplateDraftTemplate,
  MarketplaceTemplateBase,
  MarketplaceTemplateDetail,
  MarketplaceTemplateDraft,
  MarketplaceTemplateItem,
  MarketplaceTemplateSummary,
  TemplateAuthor,
  TemplateCategory,
  TemplateCoverItem,
  TemplateMediaRef,
} from '@tierlistbuilder/contracts/marketplace/template'
import {
  DEFAULT_TEMPLATE_LIST_LIMIT,
  DEFAULT_TEMPLATE_DRAFT_LIMIT,
  generateTemplateSlug,
  MAX_TEMPLATE_DRAFT_LIMIT,
  MAX_TEMPLATE_COVER_ITEMS,
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

interface TemplateProjectionCache
{
  authors: Map<Id<'users'>, Promise<TemplateAuthor>>
  media: Map<Id<'mediaAssets'>, Promise<TemplateMediaRef | null>>
}

const MAX_SEARCH_QUERY_LENGTH = 120
const MAX_SLUG_ATTEMPTS = 8
const MAX_DRAFT_COVER_ITEMS = 4
const MARKETPLACE_STATS_KEY = 'templates'

export const createTemplateProjectionCache = (): TemplateProjectionCache => ({
  authors: new Map(),
  media: new Map(),
})

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

export const normalizeDraftLimit = (raw: number | undefined): number =>
{
  if (raw === undefined)
  {
    return DEFAULT_TEMPLATE_DRAFT_LIMIT
  }
  if (!Number.isFinite(raw) || raw < 1)
  {
    failInput('template draft limit must be a positive number')
  }
  return Math.min(Math.floor(raw), MAX_TEMPLATE_DRAFT_LIMIT)
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

export const isPublicTemplateRow = (
  template: Pick<Doc<'templates'>, 'visibility' | 'unpublishedAt'>
): boolean =>
  template.visibility === 'public' && template.unpublishedAt === null

export const readPublicTemplateCount = async (
  ctx: QueryCtx
): Promise<number> =>
{
  const stats = await ctx.db
    .query('marketplaceStats')
    .withIndex('byKey', (q) => q.eq('key', MARKETPLACE_STATS_KEY))
    .unique()

  return stats?.publicTemplateCount ?? 0
}

export const adjustPublicTemplateCount = async (
  ctx: MutationCtx,
  delta: number
): Promise<void> =>
{
  if (delta === 0)
  {
    return
  }

  const stats = await ctx.db
    .query('marketplaceStats')
    .withIndex('byKey', (q) => q.eq('key', MARKETPLACE_STATS_KEY))
    .unique()
  const nextCount = Math.max(0, (stats?.publicTemplateCount ?? 0) + delta)

  if (stats)
  {
    await ctx.db.patch(stats._id, {
      publicTemplateCount: nextCount,
      updatedAt: Date.now(),
    })
    return
  }

  await ctx.db.insert('marketplaceStats', {
    key: MARKETPLACE_STATS_KEY,
    publicTemplateCount: nextCount,
    updatedAt: Date.now(),
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

const loadTemplateMediaRef = async (
  ctx: DbCtx,
  mediaAssetId: Id<'mediaAssets'>
): Promise<TemplateMediaRef | null> =>
{
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

export const toTemplateMediaRef = async (
  ctx: DbCtx,
  mediaAssetId: Id<'mediaAssets'> | null,
  cache?: TemplateProjectionCache
): Promise<TemplateMediaRef | null> =>
{
  if (!mediaAssetId)
  {
    return null
  }

  if (!cache)
  {
    return await loadTemplateMediaRef(ctx, mediaAssetId)
  }

  const existing = cache.media.get(mediaAssetId)
  if (existing)
  {
    return await existing
  }

  const pending = loadTemplateMediaRef(ctx, mediaAssetId)
  cache.media.set(mediaAssetId, pending)
  return await pending
}

// load denormalized cover items in template order. publish stores only
// media-backed item ids + labels, so summary reads avoid a templateItems scan
export const loadCoverItems = async (
  ctx: DbCtx,
  template: Pick<Doc<'templates'>, 'coverItems'>,
  options: {
    cache?: TemplateProjectionCache
    limit?: number
  } = {}
): Promise<TemplateCoverItem[]> =>
{
  const rows = template.coverItems.slice(
    0,
    options.limit ?? MAX_TEMPLATE_COVER_ITEMS
  )
  const refs = await Promise.all(
    rows.map(async (item): Promise<TemplateCoverItem | null> =>
    {
      const media = await toTemplateMediaRef(
        ctx,
        item.mediaAssetId,
        options.cache
      )
      return media ? { media, label: item.label } : null
    })
  )

  return refs.filter((item): item is TemplateCoverItem => item !== null)
}

const loadTemplateAuthor = async (
  ctx: DbCtx,
  authorId: Id<'users'>
): Promise<TemplateAuthor> =>
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

export const toTemplateAuthor = async (
  ctx: DbCtx,
  authorId: Id<'users'>,
  cache?: TemplateProjectionCache
): Promise<TemplateAuthor> =>
{
  if (!cache)
  {
    return await loadTemplateAuthor(ctx, authorId)
  }

  const existing = cache.authors.get(authorId)
  if (existing)
  {
    return await existing
  }

  const pending = loadTemplateAuthor(ctx, authorId)
  cache.authors.set(authorId, pending)
  return await pending
}

export const toTemplateBase = async (
  ctx: DbCtx,
  template: Doc<'templates'>,
  cache?: TemplateProjectionCache
): Promise<MarketplaceTemplateBase> =>
{
  const [author, coverMedia] = await Promise.all([
    toTemplateAuthor(ctx, template.authorId, cache),
    toTemplateMediaRef(ctx, template.coverMediaAssetId, cache),
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

export const toTemplateSummary = async (
  ctx: DbCtx,
  template: Doc<'templates'>,
  cache?: TemplateProjectionCache
): Promise<MarketplaceTemplateSummary> =>
{
  const base = await toTemplateBase(ctx, template, cache)
  const coverItems = base.coverMedia
    ? []
    : await loadCoverItems(ctx, template, { cache })

  return {
    ...base,
    coverItems,
  }
}

export const toTemplateDetail = async (
  ctx: DbCtx,
  template: Doc<'templates'>
): Promise<MarketplaceTemplateDetail> =>
{
  const [base, items] = await Promise.all([
    toTemplateBase(ctx, template),
    loadTemplateItems(ctx, template._id),
  ])

  const mediaAssetIds = [
    ...new Set(
      items
        .map((item) => item.mediaAssetId)
        .filter((id): id is Id<'mediaAssets'> => id !== null)
    ),
  ]
  const mediaRefEntries = await Promise.all(
    mediaAssetIds.map(
      async (mediaAssetId) =>
        [mediaAssetId, await toTemplateMediaRef(ctx, mediaAssetId)] as const
    )
  )
  const mediaRefs = new Map<Id<'mediaAssets'>, TemplateMediaRef | null>(
    mediaRefEntries
  )

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
    ...base,
    suggestedTiers: template.suggestedTiers,
    items: projectedItems,
  }
}

export const toTemplateDraft = async (
  ctx: DbCtx,
  board: Doc<'boards'>,
  template: Doc<'templates'>,
  cache?: TemplateProjectionCache
): Promise<MarketplaceTemplateDraft> =>
{
  const activeItemCount = board.activeItemCount
  const unrankedItemCount = board.unrankedItemCount
  const rankedItemCount = activeItemCount - unrankedItemCount
  const progressPercent =
    activeItemCount === 0
      ? 100
      : Math.round((rankedItemCount / activeItemCount) * 100)
  const coverMedia = await toTemplateMediaRef(
    ctx,
    template.coverMediaAssetId,
    cache
  )
  const draftTemplate: MarketplaceTemplateDraftTemplate = {
    slug: template.slug,
    title: template.title,
    category: template.category,
    coverMedia,
    coverItems: coverMedia
      ? []
      : await loadCoverItems(ctx, template, {
          cache,
          limit: MAX_DRAFT_COVER_ITEMS,
        }),
  }

  return {
    boardExternalId: board.externalId,
    boardTitle: board.title,
    updatedAt: board.updatedAt,
    activeItemCount,
    rankedItemCount,
    unrankedItemCount,
    progressPercent,
    template: draftTemplate,
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
        sourceMediaAssetId: null,
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
