// convex/marketplace/templates/lib/projections.ts
// read-side template projections: media/author/item loaders, stats reads, &
// summary/detail/draft/item/card shaping into marketplace contract types

import { ConvexError } from 'convex/values'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import type { Doc, Id } from '../../../_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import type { MediaVariantKind } from '@tierlistbuilder/contracts/platform/media'
import { selectMediaVariantSummary } from '../../../lib/mediaVariants'
import { memoizePromise } from '../../../lib/cache'
import { findTemplateBySlug } from '../../../lib/marketplaceLookups'
import type {
  MarketplaceTemplateDraftTemplate,
  MarketplaceTemplateBase,
  MarketplaceTemplateDetail,
  MarketplaceTemplateDraft,
  MarketplaceTemplateItem,
  MarketplaceTemplateSummary,
  TemplateAuthor,
  TemplateCoverItem,
  TemplateMediaRef,
} from '@tierlistbuilder/contracts/marketplace/template'
import { MAX_TEMPLATE_COVER_ITEMS } from '@tierlistbuilder/contracts/marketplace/template'
import type { UserPlan } from '@tierlistbuilder/contracts/platform/user'
import { MAX_LARGE_CLOUD_BOARD_ITEMS } from '@tierlistbuilder/contracts/workspace/cloudBoard'
import {
  createTemplateProjectionCache,
  getInitialTemplateCardMetrics,
  getTemplateCardMetrics,
  readTemplateCounters,
  MARKETPLACE_STATS_KEY,
  type TemplateCardMetrics,
  type TemplateProjectionCache,
} from './trending'
import { buildSearchText, failState } from './normalize'
import { getTemplateAccessState, isPublishedTemplateRow } from './state'
import { resolveTemplateCriteria } from '../criteria'

type DbCtx = QueryCtx | MutationCtx

const MAX_DRAFT_COVER_ITEMS = 4

export type TemplateCardSource = Pick<
  Doc<'templates'>,
  | '_id'
  | 'slug'
  | 'authorId'
  | 'title'
  | 'description'
  | 'category'
  | 'tags'
  | 'visibility'
  | 'coverMediaAssetId'
  | 'coverFraming'
  | 'coverItems'
  | 'sizeClass'
  | 'publicationState'
  | 'isPubliclyListable'
  | 'itemCount'
  | 'featuredRank'
  | 'creditLine'
  | 'itemAspectRatio'
  | 'defaultItemImageFit'
  | 'defaultItemImagePadding'
  | 'autoPlate'
  | 'createdAt'
  | 'updatedAt'
>

type TemplateCardMedia = NonNullable<Doc<'templateCards'>['coverMedia']>

type CoverItemPresentationSource = {
  label?: TemplateCoverItem['label']
  backgroundColor?: TemplateCoverItem['backgroundColor']
  mediaPlate?: TemplateCoverItem['mediaPlate']
  aspectRatio?: TemplateCoverItem['aspectRatio']
  imageFit?: TemplateCoverItem['imageFit']
  transform?: TemplateCoverItem['transform']
  imagePadding?: TemplateCoverItem['imagePadding']
}

export const pickCoverItemPresentationFields = (
  item: CoverItemPresentationSource
): Omit<TemplateCoverItem, 'media'> => ({
  label: item.label ?? null,
  backgroundColor: item.backgroundColor ?? null,
  mediaPlate: item.mediaPlate ?? null,
  aspectRatio: item.aspectRatio ?? null,
  imageFit: item.imageFit ?? null,
  transform: item.transform ?? null,
  imagePadding: item.imagePadding ?? null,
})

export interface PublicTemplateStats
{
  count: number
  countByCategory: Record<string, number>
}

export const readPublicTemplateStats = async (
  ctx: QueryCtx
): Promise<PublicTemplateStats> =>
{
  const stats = await ctx.db
    .query('marketplaceStats')
    .withIndex('byKey', (q) => q.eq('key', MARKETPLACE_STATS_KEY))
    .unique()

  return {
    count: stats?.publicTemplateCount ?? 0,
    countByCategory: { ...(stats?.publicTemplateCountByCategory ?? {}) },
  }
}

export const findTemplateStatsByTemplateId = async (
  ctx: DbCtx,
  templateId: Id<'templates'>,
  cache?: TemplateProjectionCache
): Promise<Doc<'templateStats'> | null> =>
{
  if (!cache)
  {
    return await ctx.db
      .query('templateStats')
      .withIndex('byTemplateId', (q) => q.eq('templateId', templateId))
      .unique()
  }
  return await memoizePromise(cache.stats, templateId, () =>
    ctx.db
      .query('templateStats')
      .withIndex('byTemplateId', (q) => q.eq('templateId', templateId))
      .unique()
  )
}

export const requireTemplateStats = async (
  ctx: DbCtx,
  templateId: Id<'templates'>,
  cache?: TemplateProjectionCache
): Promise<Doc<'templateStats'>> =>
{
  const stats = await findTemplateStatsByTemplateId(ctx, templateId, cache)
  if (!stats)
  {
    return failState(`template stats missing: ${templateId}`)
  }
  return stats
}

export const loadTemplateItems = async (
  ctx: DbCtx,
  templateId: Id<'templates'>
): Promise<Doc<'templateItems'>[]> =>
{
  const items = await ctx.db
    .query('templateItems')
    .withIndex('byTemplate', (q) => q.eq('templateId', templateId))
    .take(MAX_LARGE_CLOUD_BOARD_ITEMS + 1)

  if (items.length > MAX_LARGE_CLOUD_BOARD_ITEMS)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.syncLimitExceeded,
      message: `template item rows exceed ${MAX_LARGE_CLOUD_BOARD_ITEMS}`,
    })
  }

  return items
}

const loadAsset = async (
  ctx: DbCtx,
  mediaAssetId: Id<'mediaAssets'>,
  cache?: TemplateProjectionCache
): Promise<Doc<'mediaAssets'> | null> =>
{
  if (!cache) return await ctx.db.get(mediaAssetId)
  return await memoizePromise(cache.assets, mediaAssetId, () =>
    ctx.db.get(mediaAssetId)
  )
}

const loadAssetUrl = async (
  ctx: DbCtx,
  storageId: Id<'_storage'>,
  cache?: TemplateProjectionCache
): Promise<string | null> =>
{
  if (!cache) return await ctx.storage.getUrl(storageId)
  return await memoizePromise(cache.urls, storageId, () =>
    ctx.storage.getUrl(storageId)
  )
}

const buildMediaRefFromVariant = (
  externalId: string,
  variant: Pick<
    TemplateMediaRef,
    'contentHash' | 'width' | 'height' | 'mimeType'
  >,
  url: string
): TemplateMediaRef => ({
  externalId,
  contentHash: variant.contentHash,
  url,
  width: variant.width,
  height: variant.height,
  mimeType: variant.mimeType,
})

const buildMediaRef = async (
  ctx: DbCtx,
  asset: Doc<'mediaAssets'>,
  kind: MediaVariantKind,
  cache?: TemplateProjectionCache
): Promise<TemplateMediaRef | null> =>
{
  const variant = selectMediaVariantSummary(asset, kind)
  if (!variant) return null
  const url = await loadAssetUrl(ctx, variant.storageId, cache)
  if (!url) return null
  return buildMediaRefFromVariant(asset.externalId, variant, url)
}

export const toTemplateMediaRef = async (
  ctx: DbCtx,
  mediaAssetId: Id<'mediaAssets'> | null,
  kind: MediaVariantKind,
  cache?: TemplateProjectionCache
): Promise<TemplateMediaRef | null> =>
  await toTemplateMediaRefWithFallback(ctx, mediaAssetId, [kind], cache)

export const toTemplateMediaRefWithFallback = async (
  ctx: DbCtx,
  mediaAssetId: Id<'mediaAssets'> | null,
  kinds: readonly MediaVariantKind[],
  cache?: TemplateProjectionCache
): Promise<TemplateMediaRef | null> =>
{
  if (!mediaAssetId) return null
  const asset = await loadAsset(ctx, mediaAssetId, cache)
  if (!asset)
  {
    return failState(`dangling template media reference: ${mediaAssetId}`)
  }
  for (const kind of kinds)
  {
    const ref = await buildMediaRef(ctx, asset, kind, cache)
    if (ref) return ref
  }
  return null
}

// load denormalized cover items in template order. publish stores only
// media-backed item ids + labels, so summary reads avoid a templateItems scan
export const loadCoverItems = async (
  ctx: DbCtx,
  template: Pick<Doc<'templates'>, 'coverItems'>,
  options: {
    cache?: TemplateProjectionCache
    limit?: number
    kind?: MediaVariantKind
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
        options.kind ?? 'tile',
        options.cache
      )
      return media
        ? {
            media,
            ...pickCoverItemPresentationFields(item),
          }
        : null
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

  const displayName = toAuthorDisplayName(author)
  const avatarUrl =
    author.image ??
    (author.avatarStorageId
      ? await ctx.storage.getUrl(author.avatarStorageId)
      : null)

  return {
    id: author.externalId ?? author._id,
    displayName,
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

  return await memoizePromise(cache.authors, authorId, () =>
    loadTemplateAuthor(ctx, authorId)
  )
}

const toAuthorDisplayName = (
  author: Pick<Doc<'users'>, 'handle' | 'displayName' | 'name' | 'email'>
): string =>
  author.handle
    ? `@${author.handle}`
    : (author.displayName ?? author.name ?? author.email ?? 'Tier list creator')

const toTemplateCardMedia = async (
  ctx: DbCtx,
  mediaAssetId: Id<'mediaAssets'> | null,
  kinds: readonly MediaVariantKind[] = ['tile'],
  cache?: TemplateProjectionCache
): Promise<TemplateCardMedia | null> =>
{
  if (!mediaAssetId) return null
  const asset = await loadAsset(ctx, mediaAssetId, cache)
  if (!asset)
  {
    return failState(`dangling template media reference: ${mediaAssetId}`)
  }
  const variant = kinds
    .map((kind) => selectMediaVariantSummary(asset, kind))
    .find((candidate) => candidate !== undefined)
  if (!variant) return null
  return {
    externalId: asset.externalId,
    storageId: variant.storageId,
    width: variant.width,
    height: variant.height,
    byteSize: variant.byteSize,
    mimeType: variant.mimeType,
    contentHash: variant.contentHash,
  }
}

const toTemplateCardCoverItems = async (
  ctx: DbCtx,
  template: Pick<TemplateCardSource, 'coverItems'>,
  cache?: TemplateProjectionCache
): Promise<Doc<'templateCards'>['coverItems']> =>
{
  const rows = template.coverItems.slice(0, MAX_TEMPLATE_COVER_ITEMS)
  const items = await Promise.all(
    rows.map(async (item) =>
    {
      const media = await toTemplateCardMedia(
        ctx,
        item.mediaAssetId,
        ['tile'],
        cache
      )
      return media
        ? {
            media,
            ...pickCoverItemPresentationFields(item),
          }
        : null
    })
  )
  return items.filter((item): item is TemplateCoverItemForCard => item !== null)
}

type TemplateCoverItemForCard = Doc<'templateCards'>['coverItems'][number]

const toTemplateCardAuthorFields = async (
  ctx: DbCtx,
  authorId: Id<'users'>
): Promise<
  Pick<
    Doc<'templateCards'>,
    | 'authorExternalId'
    | 'authorDisplayName'
    | 'authorImageUrl'
    | 'authorAvatarStorageId'
  >
> =>
{
  const author = await ctx.db.get(authorId)
  if (!author)
  {
    return failState(`template author missing: ${authorId}`)
  }

  return {
    authorExternalId: author.externalId ?? author._id,
    authorDisplayName: toAuthorDisplayName(author),
    authorImageUrl: author.image ?? null,
    authorAvatarStorageId: author.avatarStorageId ?? null,
  }
}

export const buildTemplateCardFields = async (
  ctx: DbCtx,
  template: TemplateCardSource,
  metrics: TemplateCardMetrics,
  cache: TemplateProjectionCache = createTemplateProjectionCache()
): Promise<Omit<Doc<'templateCards'>, '_id' | '_creationTime'>> =>
{
  const author = await toTemplateCardAuthorFields(ctx, template.authorId)
  const [coverMedia, coverItems] = await Promise.all([
    toTemplateCardMedia(
      ctx,
      template.coverMediaAssetId,
      ['preview', 'tile'],
      cache
    ),
    toTemplateCardCoverItems(ctx, template, cache),
  ])
  return {
    templateId: template._id,
    slug: template.slug,
    title: template.title,
    description: template.description,
    category: template.category,
    tags: template.tags,
    visibility: template.visibility,
    publicationState: template.publicationState,
    isPubliclyListable: template.isPubliclyListable,
    itemCount: template.itemCount,
    sizeClass: template.sizeClass,
    authorId: template.authorId,
    ...author,
    coverMedia,
    coverFraming: template.coverFraming ?? null,
    coverItems,
    itemAspectRatio: template.itemAspectRatio ?? null,
    defaultItemImageFit: template.defaultItemImageFit ?? null,
    defaultItemImagePadding: template.defaultItemImagePadding ?? null,
    autoPlate: template.autoPlate,
    featuredRank: template.featuredRank,
    forkCount: metrics.forkCount,
    viewCount: metrics.viewCount,
    weeklyForkCount: metrics.weeklyForkCount,
    weeklyViewCount: metrics.weeklyViewCount,
    trendingScore: metrics.trendingScore,
    trendingComputedAt: metrics.trendingComputedAt,
    rankingCount: metrics.rankingCount,
    creditLine: template.creditLine,
    searchText: buildSearchText({
      title: template.title,
      description: template.description,
      category: template.category,
      tags: template.tags,
      authorDisplayName: author.authorDisplayName,
    }),
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  }
}

export const findTemplateCardByTemplateId = async (
  ctx: DbCtx,
  templateId: Id<'templates'>
): Promise<Doc<'templateCards'> | null> =>
  await ctx.db
    .query('templateCards')
    .withIndex('byTemplateId', (q) => q.eq('templateId', templateId))
    .unique()

export const requireTemplateCardByTemplateId = async (
  ctx: DbCtx,
  templateId: Id<'templates'>
): Promise<Doc<'templateCards'>> =>
{
  const card = await findTemplateCardByTemplateId(ctx, templateId)
  if (!card)
  {
    return failState(`template card missing: ${templateId}`)
  }
  return card
}

const toTemplateCardAuthor = async (
  ctx: DbCtx,
  card: Doc<'templateCards'>,
  cache?: TemplateProjectionCache
): Promise<TemplateAuthor> =>
{
  const avatarUrl =
    card.authorImageUrl ??
    (card.authorAvatarStorageId
      ? await loadAssetUrl(ctx, card.authorAvatarStorageId, cache)
      : null)
  return {
    id: card.authorExternalId,
    displayName: card.authorDisplayName,
    avatarUrl,
  }
}

const toTemplateCardMediaRef = async (
  ctx: DbCtx,
  media: TemplateCardMedia,
  cache?: TemplateProjectionCache
): Promise<TemplateMediaRef | null> =>
{
  const url = await loadAssetUrl(ctx, media.storageId, cache)
  if (!url) return null
  return buildMediaRefFromVariant(media.externalId, media, url)
}

const toTemplateCardCoverItem = async (
  ctx: DbCtx,
  item: TemplateCoverItemForCard,
  cache?: TemplateProjectionCache
): Promise<TemplateCoverItem | null> =>
{
  const media = await toTemplateCardMediaRef(ctx, item.media, cache)
  return media
    ? {
        media,
        ...pickCoverItemPresentationFields(item),
      }
    : null
}

export const toTemplateCardSummary = async (
  ctx: DbCtx,
  card: Doc<'templateCards'>,
  cache?: TemplateProjectionCache
): Promise<MarketplaceTemplateSummary> =>
{
  const [author, coverMedia] = await Promise.all([
    toTemplateCardAuthor(ctx, card, cache),
    card.coverMedia
      ? toTemplateCardMediaRef(ctx, card.coverMedia, cache)
      : null,
  ])
  const coverItems = coverMedia
    ? []
    : (
        await Promise.all(
          card.coverItems.map((item) =>
            toTemplateCardCoverItem(ctx, item, cache)
          )
        )
      ).filter((item): item is TemplateCoverItem => item !== null)

  const counters = readTemplateCounters(card)
  return {
    slug: card.slug,
    title: card.title,
    description: card.description,
    category: card.category,
    tags: card.tags,
    visibility: card.visibility,
    sizeClass: card.sizeClass,
    publicationState: card.publicationState,
    author,
    coverMedia,
    coverFraming: card.coverFraming ?? null,
    coverItems,
    itemAspectRatio: card.itemAspectRatio,
    defaultItemImageFit: card.defaultItemImageFit,
    defaultItemImagePadding: card.defaultItemImagePadding,
    autoPlate: card.autoPlate ?? null,
    itemCount: card.itemCount,
    forkCount: counters.forkCount,
    viewCount: counters.viewCount,
    rankingCount: card.rankingCount,
    weeklyForkCount: card.weeklyForkCount,
    weeklyViewCount: card.weeklyViewCount,
    trendingScore: card.trendingScore,
    trendingComputedAt: card.trendingComputedAt,
    featuredRank: card.featuredRank,
    creditLine: card.creditLine,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  }
}

export const toTemplateBase = async (
  ctx: DbCtx,
  template: Doc<'templates'>,
  coverKinds: readonly MediaVariantKind[] = ['tile'],
  cache?: TemplateProjectionCache
): Promise<MarketplaceTemplateBase> =>
{
  const [author, coverMedia, stats, card] = await Promise.all([
    toTemplateAuthor(ctx, template.authorId, cache),
    toTemplateMediaRefWithFallback(
      ctx,
      template.coverMediaAssetId,
      coverKinds,
      cache
    ),
    requireTemplateStats(ctx, template._id, cache),
    findTemplateCardByTemplateId(ctx, template._id),
  ])
  const counters = readTemplateCounters(stats)
  const metrics = card
    ? getTemplateCardMetrics(card)
    : getInitialTemplateCardMetrics(counters)

  return {
    slug: template.slug,
    title: template.title,
    description: template.description,
    category: template.category,
    tags: template.tags,
    visibility: template.visibility,
    sizeClass: template.sizeClass,
    publicationState: template.publicationState,
    author,
    coverMedia,
    coverFraming: template.coverFraming ?? null,
    itemCount: template.itemCount,
    forkCount: counters.forkCount,
    viewCount: counters.viewCount,
    rankingCount: metrics.rankingCount,
    weeklyForkCount: metrics.weeklyForkCount,
    weeklyViewCount: metrics.weeklyViewCount,
    trendingScore: metrics.trendingScore,
    trendingComputedAt: metrics.trendingComputedAt,
    featuredRank: template.featuredRank,
    creditLine: template.creditLine,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  }
}

export const toTemplateDetail = async (
  ctx: DbCtx,
  template: Doc<'templates'>,
  viewerPlan: UserPlan,
  cache?: TemplateProjectionCache
): Promise<MarketplaceTemplateDetail> =>
{
  const criteria = resolveTemplateCriteria(template)
  const [base, coverItems, rankingCountByCriterion] = await Promise.all([
    toTemplateBase(ctx, template, ['preview', 'editor', 'tile'], cache),
    template.coverMediaAssetId
      ? []
      : loadCoverItems(ctx, template, { cache, kind: 'tile' }),
    loadRankingCountByCriterion(ctx, template._id, criteria),
  ])

  return {
    ...base,
    // the detail total must equal its own per-criterion breakdown - derive it
    // straight from rankingCountByCriterion rather than the card rollup
    rankingCount: Object.values(rankingCountByCriterion).reduce(
      (sum, count) => sum + count,
      0
    ),
    coverItems,
    itemAspectRatio: template.itemAspectRatio ?? null,
    defaultItemImageFit: template.defaultItemImageFit ?? null,
    defaultItemImagePadding: template.defaultItemImagePadding ?? null,
    autoPlate: template.autoPlate ?? null,
    access: getTemplateAccessState(template, viewerPlan),
    criteria,
    rankingCountByCriterion,
    suggestedTiers: template.suggestedTiers,
    labels: template.labels ?? null,
  }
}

// read one aggregate parent row per known criterion; templates cap criteria at
// eight, so this stays bounded & avoids scanning stale aggregate rows
const loadRankingCountByCriterion = async (
  ctx: DbCtx,
  templateId: Id<'templates'>,
  criteria: readonly { externalId: string }[]
): Promise<Record<string, number>> =>
{
  // pre-fill so every visible criterion has a count entry even when its
  // aggregate row hasn't materialized yet (lane has 0 published rankings)
  const known = new Set(criteria.map((c) => c.externalId))
  const result: Record<string, number> = {}
  for (const externalId of known)
  {
    result[externalId] = 0
  }

  await Promise.all(
    [...known].map(async (externalId) =>
    {
      const row = await ctx.db
        .query('templateRankingAggregates')
        .withIndex('byTemplateIdAndCriterion', (q) =>
          q.eq('templateId', templateId).eq('criterionExternalId', externalId)
        )
        .unique()
      if (row)
      {
        result[externalId] = row.rankingCount
      }
    })
  )
  return result
}

export const toTemplateItem = async (
  ctx: DbCtx,
  item: Doc<'templateItems'>,
  cache?: TemplateProjectionCache
): Promise<MarketplaceTemplateItem> => ({
  externalId: item.externalId,
  label: item.label,
  backgroundColor: item.backgroundColor,
  mediaPlate: item.mediaPlate ?? null,
  altText: item.altText,
  media: item.mediaAssetId
    ? await toTemplateMediaRef(ctx, item.mediaAssetId, 'tile', cache)
    : null,
  order: item.order,
  aspectRatio: item.aspectRatio,
  imageFit: item.imageFit,
  transform: item.transform,
  imagePadding: item.imagePadding ?? null,
})

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
  const coverMedia = await toTemplateMediaRefWithFallback(
    ctx,
    template.coverMediaAssetId,
    ['preview', 'tile'],
    cache
  )
  const draftTemplate: MarketplaceTemplateDraftTemplate = {
    slug: template.slug,
    title: template.title,
    category: template.category,
    coverMedia,
    coverFraming: template.coverFraming ?? null,
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

export const loadPublishedTemplateBySlug = async (
  ctx: DbCtx,
  slug: string
): Promise<Doc<'templates'> | null> =>
{
  const template = await findTemplateBySlug(ctx, slug)
  return template && isPublishedTemplateRow(template) ? template : null
}
