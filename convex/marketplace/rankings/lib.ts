// convex/marketplace/rankings/lib.ts
// shared ranking projection, normalization, & lookup helpers

import { ConvexError } from 'convex/values'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import {
  DEFAULT_RANKING_LIST_LIMIT,
  MAX_RANKING_DESCRIPTION_LENGTH,
  MAX_RANKING_LIST_LIMIT,
  MAX_RANKING_TITLE_LENGTH,
  generateRankingSlug,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import type {
  MarketplaceRankingDetail,
  MarketplaceRankingItem,
  MarketplaceRankingSummary,
  MarketplaceRankingTier,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import { MAX_LARGE_CLOUD_BOARD_ITEMS } from '@tierlistbuilder/contracts/workspace/cloudBoard'
import { failInput, normalizeNullableText } from '../../lib/text'
import {
  createTemplateProjectionCache,
  failState,
  toTemplateAuthor,
  toTemplateMediaRef,
} from '../templates/lib'

type DbCtx = QueryCtx | MutationCtx

const MAX_SLUG_ATTEMPTS = 8
const MAX_RANKING_TIER_ROWS = 64

export const normalizeRankingTitle = (raw: string): string =>
{
  const title = raw.trim().slice(0, MAX_RANKING_TITLE_LENGTH)
  if (!title)
  {
    failInput('ranking title is required')
  }
  return title
}

export const normalizeRankingDescription = (
  raw: string | null | undefined
): string | null =>
  normalizeNullableText(raw, MAX_RANKING_DESCRIPTION_LENGTH, 'description')

export const normalizeRankingLimit = (raw: number | undefined): number =>
{
  if (raw === undefined) return DEFAULT_RANKING_LIST_LIMIT
  if (!Number.isFinite(raw)) return DEFAULT_RANKING_LIST_LIMIT
  return Math.max(1, Math.min(MAX_RANKING_LIST_LIMIT, Math.floor(raw)))
}

export const allocateRankingSlug = async (ctx: DbCtx): Promise<string> =>
{
  for (let i = 0; i < MAX_SLUG_ATTEMPTS; i++)
  {
    const slug = generateRankingSlug()
    const existing = await ctx.db
      .query('publishedRankings')
      .withIndex('bySlug', (q) => q.eq('slug', slug))
      .unique()
    if (!existing) return slug
  }

  throw new ConvexError({
    code: CONVEX_ERROR_CODES.slugAllocationFailed,
    message: 'could not allocate a unique ranking slug',
  })
}

export const findRankingBySlug = async (
  ctx: DbCtx,
  slug: string
): Promise<Doc<'publishedRankings'> | null> =>
  await ctx.db
    .query('publishedRankings')
    .withIndex('bySlug', (q) => q.eq('slug', slug))
    .unique()

export const isPublishedRankingRow = (
  ranking: Pick<Doc<'publishedRankings'>, 'publicationState'>
): boolean => ranking.publicationState === 'published'

export const isPublicRankingRow = (
  ranking: Pick<
    Doc<'publishedRankings'>,
    'visibility' | 'publicationState' | 'isPubliclyListable'
  >
): boolean =>
  ranking.visibility === 'public' &&
  ranking.publicationState === 'published' &&
  ranking.isPubliclyListable

export const requireOwnedRanking = async (
  ctx: DbCtx,
  slug: string,
  userId: Id<'users'>
): Promise<Doc<'publishedRankings'>> =>
{
  const ranking = await findRankingBySlug(ctx, slug)
  if (!ranking)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.notFound,
      message: 'ranking not found',
    })
  }
  if (ranking.ownerId !== userId)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.forbidden,
      message: 'not the owner of this ranking',
    })
  }
  return ranking
}

export const toRankingSummary = async (
  ctx: DbCtx,
  ranking: Doc<'publishedRankings'>
): Promise<MarketplaceRankingSummary> => ({
  slug: ranking.slug,
  title: ranking.title,
  description: ranking.description,
  visibility: ranking.visibility,
  publicationState: ranking.publicationState,
  author: await toTemplateAuthor(
    ctx,
    ranking.ownerId,
    createTemplateProjectionCache()
  ),
  template: {
    slug: ranking.sourceTemplateSlug,
    title: ranking.sourceTemplateTitle,
    category: ranking.sourceTemplateCategory,
  },
  itemCount: ranking.itemCount,
  tierCount: ranking.tierCount,
  remixCount: ranking.remixCount,
  viewCount: ranking.viewCount,
  createdAt: ranking.createdAt,
  updatedAt: ranking.updatedAt,
})

export const loadRankingTiers = async (
  ctx: DbCtx,
  rankingId: Id<'publishedRankings'>
): Promise<Doc<'publishedRankingTiers'>[]> =>
{
  const rows = await ctx.db
    .query('publishedRankingTiers')
    .withIndex('byRanking', (q) => q.eq('rankingId', rankingId))
    .take(MAX_RANKING_TIER_ROWS)
  return rows.sort((a, b) => a.order - b.order)
}

export const loadRankingItems = async (
  ctx: DbCtx,
  rankingId: Id<'publishedRankings'>
): Promise<Doc<'publishedRankingItems'>[]> =>
{
  const rows = await ctx.db
    .query('publishedRankingItems')
    .withIndex('byRanking', (q) => q.eq('rankingId', rankingId))
    .take(MAX_LARGE_CLOUD_BOARD_ITEMS + 1)
  if (rows.length > MAX_LARGE_CLOUD_BOARD_ITEMS)
  {
    return failState('ranking item rows exceed the maximum board item count')
  }
  return rows.sort((a, b) => a.order - b.order)
}

const toRankingTier = (
  tier: Doc<'publishedRankingTiers'>
): MarketplaceRankingTier => ({
  externalId: tier.externalId,
  name: tier.name,
  description: tier.description,
  colorSpec: tier.colorSpec,
  rowColorSpec: tier.rowColorSpec,
  order: tier.order,
})

const toRankingItem = async (
  ctx: DbCtx,
  item: Doc<'publishedRankingItems'>
): Promise<MarketplaceRankingItem> => ({
  externalId: item.externalId,
  templateItemExternalId: item.templateItemExternalId,
  tierExternalId: item.tierExternalId,
  label: item.label,
  backgroundColor: item.backgroundColor,
  altText: item.altText,
  media: item.mediaAssetId
    ? await toTemplateMediaRef(
        ctx,
        item.mediaAssetId,
        'tile',
        createTemplateProjectionCache()
      )
    : null,
  order: item.order,
  aspectRatio: item.aspectRatio,
  imageFit: item.imageFit,
  transform: item.transform,
})

export const toRankingDetail = async (
  ctx: DbCtx,
  ranking: Doc<'publishedRankings'>
): Promise<MarketplaceRankingDetail> =>
{
  const [summary, tiers, items] = await Promise.all([
    toRankingSummary(ctx, ranking),
    loadRankingTiers(ctx, ranking._id),
    loadRankingItems(ctx, ranking._id),
  ])

  return {
    ...summary,
    tiers: tiers.map(toRankingTier),
    items: await Promise.all(items.map((item) => toRankingItem(ctx, item))),
  }
}
