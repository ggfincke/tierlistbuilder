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
  RANKING_TOP_SCORE_REMIX_WEIGHT,
  generateRankingSlug,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import type {
  MarketplaceRankingDetail,
  MarketplaceRankingItem,
  MarketplaceRankingSummary,
  MarketplaceRankingTier,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import type { ItemTransform } from '@tierlistbuilder/contracts/workspace/board'
import { MAX_LARGE_CLOUD_BOARD_ITEMS } from '@tierlistbuilder/contracts/workspace/cloudBoard'
import { SEED_LIMITS } from '../../lib/limits'
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

export const rankingTopScore = (
  ranking: Pick<Doc<'publishedRankings'>, 'viewCount' | 'remixCount'>
): number =>
  ranking.viewCount + ranking.remixCount * RANKING_TOP_SCORE_REMIX_WEIGHT

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
  ranking: Doc<'publishedRankings'>,
  cache = createTemplateProjectionCache()
): Promise<MarketplaceRankingSummary> => ({
  slug: ranking.slug,
  title: ranking.title,
  description: ranking.description,
  visibility: ranking.visibility,
  publicationState: ranking.publicationState,
  author: await toTemplateAuthor(ctx, ranking.ownerId, cache),
  template: {
    slug: ranking.sourceTemplateSlug,
    title: ranking.sourceTemplateTitle,
    category: ranking.sourceTemplateCategory,
  },
  criterion: {
    externalId: ranking.sourceCriterionExternalId,
    name: ranking.sourceCriterionNameSnapshot,
    prompt: ranking.sourceCriterionPromptSnapshot,
  },
  itemCount: ranking.itemCount,
  tierCount: ranking.tierCount,
  remixCount: ranking.remixCount,
  viewCount: ranking.viewCount,
  featuredRank:
    ranking.isFeatured && typeof ranking.featuredRank === 'number'
      ? ranking.featuredRank
      : null,
  featuredBadge:
    ranking.isFeatured && ranking.featuredBadge ? ranking.featuredBadge : null,
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

// load every templateItems row for a template via the byTemplate index.
// rankings always derive from a single source template, so one indexed range
// read replaces N individual ctx.db.get calls
export const loadRankingTemplateItemsById = async (
  ctx: DbCtx,
  templateId: Id<'templates'>
): Promise<Map<Id<'templateItems'>, Doc<'templateItems'>>> =>
{
  const rows = await ctx.db
    .query('templateItems')
    .withIndex('byTemplate', (q) => q.eq('templateId', templateId))
    .take(SEED_LIMITS.itemsPerTemplate + 1)
  if (rows.length > SEED_LIMITS.itemsPerTemplate)
  {
    return failState(
      `template item count exceeds read limit for template ${templateId}`
    )
  }
  return new Map(rows.map((row) => [row._id, row]))
}

// single source of truth for the snapshot fields publishedRankingItems may
// omit (compact rows). resolveCompactRankingItem, seed writers, & the
// content-hash payload all derive from this list to stay in sync
export const COMPACT_RANKING_ITEM_DATA_FIELDS = [
  'label',
  'backgroundColor',
  'altText',
  'mediaAssetId',
  'aspectRatio',
  'imageFit',
  'transform',
] as const

export type CompactRankingItemDataField =
  (typeof COMPACT_RANKING_ITEM_DATA_FIELDS)[number]

const rankingItemNeedsTemplateItemFallback = (
  item: Doc<'publishedRankingItems'>
): boolean =>
  item.templateItemExternalId === undefined ||
  item.externalId === undefined ||
  COMPACT_RANKING_ITEM_DATA_FIELDS.some((field) => item[field] === undefined)

const loadRankingTemplateItemsByIdForFallback = async (
  ctx: DbCtx,
  ranking: Doc<'publishedRankings'>,
  items: readonly Doc<'publishedRankingItems'>[]
): Promise<Map<Id<'templateItems'>, Doc<'templateItems'>>> =>
  items.some(rankingItemNeedsTemplateItemFallback)
    ? await loadRankingTemplateItemsById(ctx, ranking.sourceTemplateId)
    : new Map()

export interface ResolvedRankingItemFields
{
  externalId: string | null
  templateItemExternalId: string | null
  label: string | null
  backgroundColor: string | null
  altText: string | null
  mediaAssetId: Id<'mediaAssets'> | null
  aspectRatio: number | null
  imageFit: 'cover' | 'contain' | null
  transform: ItemTransform | null
}

const pickField = <T>(
  rowValue: T | undefined,
  fallback: T | undefined | null
): T | null =>
{
  if (rowValue !== undefined) return rowValue
  return fallback ?? null
}

type CompactDataFieldsResolved = Pick<
  ResolvedRankingItemFields,
  CompactRankingItemDataField
>

const resolveCompactDataFields = (
  item: Doc<'publishedRankingItems'>,
  templateItem: Doc<'templateItems'> | undefined | null
): CompactDataFieldsResolved =>
  Object.fromEntries(
    COMPACT_RANKING_ITEM_DATA_FIELDS.map((field) => [
      field,
      pickField(item[field], templateItem?.[field]),
    ])
  ) as CompactDataFieldsResolved

export const resolveCompactRankingItem = (
  item: Doc<'publishedRankingItems'>,
  templateItem: Doc<'templateItems'> | undefined | null
): ResolvedRankingItemFields => ({
  externalId: item.externalId ?? templateItem?.externalId ?? null,
  templateItemExternalId:
    item.templateItemExternalId ?? templateItem?.externalId ?? null,
  ...resolveCompactDataFields(item, templateItem),
})

export type CompactRankingItemSnapshot = Pick<
  Doc<'templateItems'>,
  CompactRankingItemDataField
>

// project the snapshot field set off a templateItem row; writers & the
// content-hash payload share this single source. see COMPACT_RANKING_ITEM_DATA_FIELDS
export const compactRankingItemSnapshot = (
  templateItem: Doc<'templateItems'>
): CompactRankingItemSnapshot =>
  Object.fromEntries(
    COMPACT_RANKING_ITEM_DATA_FIELDS.map((field) => [
      field,
      templateItem[field],
    ])
  ) as CompactRankingItemSnapshot

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

export const toRankingBucketPlacementItems = async (
  ctx: DbCtx,
  ranking: Doc<'publishedRankings'>,
  items: readonly Doc<'publishedRankingItems'>[]
): Promise<
  { templateItemExternalId: string; tierExternalId: string | null }[]
> =>
{
  const templateItemsById = await loadRankingTemplateItemsByIdForFallback(
    ctx,
    ranking,
    items
  )
  return items.flatMap((item) =>
  {
    const resolved = resolveCompactRankingItem(
      item,
      templateItemsById.get(item.templateItemId)
    )
    // placement lookups key off the template-item externalId; without one we
    // cannot place the row in the consensus grid, so skip rather than fail
    if (!resolved.templateItemExternalId) return []
    return [
      {
        templateItemExternalId: resolved.templateItemExternalId,
        tierExternalId: item.tierExternalId,
      },
    ]
  })
}

const toRankingItem = async (
  ctx: DbCtx,
  item: Doc<'publishedRankingItems'>,
  templateItem: Doc<'templateItems'> | undefined | null,
  cache = createTemplateProjectionCache()
): Promise<MarketplaceRankingItem> =>
{
  const resolved = resolveCompactRankingItem(item, templateItem)
  return {
    externalId: resolved.externalId ?? '',
    templateItemExternalId: resolved.templateItemExternalId ?? '',
    tierExternalId: item.tierExternalId,
    label: resolved.label,
    backgroundColor: resolved.backgroundColor,
    altText: resolved.altText,
    media: resolved.mediaAssetId
      ? await toTemplateMediaRef(ctx, resolved.mediaAssetId, 'tile', cache)
      : null,
    order: item.order,
    aspectRatio: resolved.aspectRatio,
    imageFit: resolved.imageFit,
    transform: resolved.transform,
  }
}

export const toRankingDetail = async (
  ctx: DbCtx,
  ranking: Doc<'publishedRankings'>
): Promise<MarketplaceRankingDetail> =>
{
  const cache = createTemplateProjectionCache()
  // speculatively load templateItems alongside everything else; full-snapshot
  // rows never read this map, but the parallel scan is what makes the
  // legacy-compact-row read no slower than the full-snapshot path
  const [summary, tiers, items, templateItemsByIdEager] = await Promise.all([
    toRankingSummary(ctx, ranking, cache),
    loadRankingTiers(ctx, ranking._id),
    loadRankingItems(ctx, ranking._id),
    loadRankingTemplateItemsById(ctx, ranking.sourceTemplateId),
  ])
  const templateItemsById = items.some(rankingItemNeedsTemplateItemFallback)
    ? templateItemsByIdEager
    : new Map<Id<'templateItems'>, Doc<'templateItems'>>()

  return {
    ...summary,
    tiers: tiers.map(toRankingTier),
    items: await Promise.all(
      items.map((item) =>
        toRankingItem(
          ctx,
          item,
          templateItemsById.get(item.templateItemId),
          cache
        )
      )
    ),
  }
}
