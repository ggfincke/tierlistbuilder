// convex/marketplace/templates/lib.ts
// shared template marketplace projection, validation, & cloning helpers

import { ConvexError } from 'convex/values'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import {
  generateItemId,
  generateTierId,
} from '@tierlistbuilder/contracts/lib/ids'
import type { MediaVariantKind } from '@tierlistbuilder/contracts/platform/media'
import {
  loadMediaVariantStorageId,
  selectMediaVariantSummary,
} from '../../lib/mediaVariants'
import type { TierPresetTier } from '@tierlistbuilder/contracts/workspace/tierPreset'
import type {
  TemplateCardAccessState,
  MarketplaceTemplateDraftTemplate,
  MarketplaceTemplateBase,
  MarketplaceTemplateDetail,
  MarketplaceTemplateDraft,
  MarketplaceTemplateItem,
  MarketplaceTemplateSummary,
  TemplateAuthor,
  TemplateJobStatus,
  TemplateCoverItem,
  TemplateMediaRef,
  TemplatePublicationState,
} from '@tierlistbuilder/contracts/marketplace/template'
import type { UserPlan } from '@tierlistbuilder/contracts/platform/user'
import type { TemplateCategory } from '@tierlistbuilder/contracts/marketplace/category'
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
  isActiveTemplateJobStatus,
  isFinishedTemplateJobStatus,
} from '@tierlistbuilder/contracts/marketplace/template'
import { MAX_LARGE_CLOUD_BOARD_ITEMS } from '@tierlistbuilder/contracts/workspace/cloudBoard'
import { DEFAULT_BOARD_TITLE } from '@tierlistbuilder/contracts/workspace/board'
import {
  classifyItemCount,
  getLargeTemplateFeatureState,
} from '../../lib/entitlements'
import { validateHexColor } from '../../lib/hexColor'
import { failInput, normalizeNullableText } from '../../lib/text'
import type { BoardLibrarySummaryItem } from '../../workspace/boards/librarySummary'
import { resolveTemplateCriteria, validateTemplateCriteria } from './criteria'

type DbCtx = QueryCtx | MutationCtx

type TemplateCardSource = Pick<
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
  | 'createdAt'
  | 'updatedAt'
>

type TemplateCardMedia = NonNullable<Doc<'templateCards'>['coverMedia']>
type TemplateStatsCounters = {
  forkCount: number
  viewCount: number
}
type TemplateCardMetrics = TemplateStatsCounters & {
  weeklyForkCount: number
  weeklyViewCount: number
  trendingScore: number
  trendingComputedAt: number | null
}

type TemplatePatch = Partial<Omit<Doc<'templates'>, '_id' | '_creationTime'>>

const normalizeTemplatePatchForWrite = (
  patch: TemplatePatch
): TemplatePatch =>
{
  if (patch.criteria === undefined) return patch
  return { ...patch, criteria: validateTemplateCriteria(patch.criteria) }
}

type LegacyForkCountSource = {
  forkCount?: number
  useCount?: number
  viewCount?: number
}

export const readLegacyForkCount = (source: LegacyForkCountSource): number =>
  typeof source.forkCount === 'number' && Number.isFinite(source.forkCount)
    ? source.forkCount
    : typeof source.useCount === 'number' && Number.isFinite(source.useCount)
      ? source.useCount
      : 0

const readTemplateCounters = (
  source: LegacyForkCountSource
): TemplateStatsCounters => ({
  forkCount: readLegacyForkCount(source),
  viewCount:
    typeof source.viewCount === 'number' && Number.isFinite(source.viewCount)
      ? source.viewCount
      : 0,
})

interface TemplateProjectionCache
{
  authors: Map<Id<'users'>, Promise<TemplateAuthor>>
  // cached by mediaAssetId only — variant pick happens off the cached asset
  // so a tile/preview/editor fallback iteration shares one asset lookup
  assets: Map<Id<'mediaAssets'>, Promise<Doc<'mediaAssets'> | null>>
  // url cached per (storageId) so different variants resolving to the same
  // blob (rare but possible after dedupe) share one ctx.storage.getUrl call
  urls: Map<Id<'_storage'>, Promise<string | null>>
  stats: Map<Id<'templates'>, Promise<Doc<'templateStats'> | null>>
}

const MAX_SEARCH_QUERY_LENGTH = 120
const MAX_SLUG_ATTEMPTS = 8
const MAX_DRAFT_COVER_ITEMS = 4
export const MARKETPLACE_STATS_KEY = 'templates'
export const TEMPLATE_TRENDING_WINDOW_DAYS = 7
export const TEMPLATE_TRENDING_DAY_MS = 24 * 60 * 60 * 1000
const TEMPLATE_TRENDING_NEWNESS_DAYS = 14
const TEMPLATE_TRENDING_FORK_WEIGHT = 100
const TEMPLATE_TRENDING_VIEW_WEIGHT = 5
const TEMPLATE_TRENDING_RECENCY_WEIGHT = 2

export const getTemplateMetricDayStart = (now: number): number =>
  Math.floor(now / TEMPLATE_TRENDING_DAY_MS) * TEMPLATE_TRENDING_DAY_MS

const getTemplateCardMetrics = (
  card: Pick<
    Doc<'templateCards'>,
    | 'forkCount'
    | 'useCount'
    | 'viewCount'
    | 'weeklyForkCount'
    | 'weeklyViewCount'
    | 'trendingScore'
    | 'trendingComputedAt'
  >
): TemplateCardMetrics =>
{
  const counters = readTemplateCounters(card)
  return {
    ...counters,
    weeklyForkCount: card.weeklyForkCount ?? 0,
    weeklyViewCount: card.weeklyViewCount ?? 0,
    trendingScore: card.trendingScore ?? 0,
    trendingComputedAt: card.trendingComputedAt ?? null,
  }
}

const getInitialTemplateCardMetrics = (
  stats: TemplateStatsCounters
): TemplateCardMetrics => ({
  ...stats,
  weeklyForkCount: 0,
  weeklyViewCount: 0,
  trendingScore: 0,
  trendingComputedAt: null,
})

export const calculateTemplateTrendingScore = (params: {
  weeklyForkCount: number
  weeklyViewCount: number
  createdAt: number
  now: number
}): number =>
{
  const ageMs = Math.max(0, params.now - params.createdAt)
  const activeDays = Math.max(
    1,
    Math.min(
      TEMPLATE_TRENDING_WINDOW_DAYS,
      Math.ceil(ageMs / TEMPLATE_TRENDING_DAY_MS)
    )
  )
  const useRate = params.weeklyForkCount / activeDays
  const viewRate = params.weeklyViewCount / activeDays
  const newness =
    Math.max(
      0,
      TEMPLATE_TRENDING_NEWNESS_DAYS - ageMs / TEMPLATE_TRENDING_DAY_MS
    ) / TEMPLATE_TRENDING_NEWNESS_DAYS

  return (
    useRate * TEMPLATE_TRENDING_FORK_WEIGHT +
    viewRate * TEMPLATE_TRENDING_VIEW_WEIGHT +
    newness * TEMPLATE_TRENDING_RECENCY_WEIGHT
  )
}

export const createTemplateProjectionCache = (): TemplateProjectionCache => ({
  authors: new Map(),
  assets: new Map(),
  urls: new Map(),
  stats: new Map(),
})

export const DEFAULT_TEMPLATE_TIERS: readonly TierPresetTier[] = [
  { name: 'S', colorSpec: { kind: 'palette', index: 0 } },
  { name: 'A', colorSpec: { kind: 'palette', index: 1 } },
  { name: 'B', colorSpec: { kind: 'palette', index: 2 } },
  { name: 'C', colorSpec: { kind: 'palette', index: 3 } },
  { name: 'D', colorSpec: { kind: 'palette', index: 4 } },
  { name: 'E', colorSpec: { kind: 'palette', index: 5 } },
]

export const failState = (message: string): never =>
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

// canonicalize a query-string tag against the publish-time tag normalizer.
// returns null on empty/over-length input so the query falls back to the
// unfiltered listing path
export const normalizeTagArg = (
  raw: string | null | undefined
): string | null =>
{
  const tag = raw?.trim().toLowerCase() ?? ''
  if (!tag) return null
  if (tag.length > MAX_TEMPLATE_TAG_LENGTH) return null
  return tag
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
  template: Pick<Doc<'templates'>, 'isPubliclyListable'>
): boolean => template.isPubliclyListable

export const isPublishedTemplateRow = (
  template: Pick<Doc<'templates'>, 'publicationState'>
): boolean => template.publicationState === 'published'

export const buildTemplateStateFields = (
  itemCount: number,
  visibility: Doc<'templates'>['visibility'],
  publicationState: TemplatePublicationState = 'published'
) =>
{
  return {
    sizeClass: classifyItemCount(itemCount),
    publicationState,
    isPubliclyListable:
      publicationState === 'published' && visibility === 'public',
  }
}

export const getTemplateAccessState = (
  template: Pick<Doc<'templates'> | Doc<'templateCards'>, 'sizeClass'>,
  viewerPlan: UserPlan
): TemplateCardAccessState =>
{
  if (template.sizeClass === 'standard') return 'usable'
  if (viewerPlan !== 'plus') return 'requiresPlus'
  return getLargeTemplateFeatureState() === 'public'
    ? 'usable'
    : 'featureNotReady'
}

export const isActiveTemplateJob = (status: TemplateJobStatus): boolean =>
  isActiveTemplateJobStatus(status)

export const isFinishedTemplateJob = (status: TemplateJobStatus): boolean =>
  isFinishedTemplateJobStatus(status)

export const clearSourceBoardLivePublicTemplate = async (
  ctx: MutationCtx,
  template: Doc<'templates'>
): Promise<void> =>
{
  if (template.sourceBoardId === null) return
  const board = await ctx.db.get(template.sourceBoardId)
  if (!board || board.livePublicTemplateId !== template._id) return

  await ctx.db.patch(board._id, {
    livePublicTemplateId: null,
  })
}

export const markTemplateNotPublic = async (
  ctx: MutationCtx,
  template: Doc<'templates'>,
  now: number,
  publicationState: Exclude<TemplatePublicationState, 'published'>,
  options: { clearSourceBoard?: boolean } = {}
): Promise<Doc<'templates'>> =>
{
  const wasPublic = isPublicTemplateRow(template)
  if (template.publicationState === publicationState && !wasPublic)
  {
    return template
  }

  const nextTemplate = await patchTemplateAndSyncCard(ctx, template, {
    publicationState,
    isPubliclyListable: false,
    updatedAt: now,
  })
  await patchTemplateTagRows(ctx, template._id, {
    isPubliclyListable: false,
    updatedAt: now,
  })
  if (wasPublic)
  {
    await adjustPublicTemplateCount(ctx, [
      { category: template.category, delta: -1 },
    ])
  }
  if (options.clearSourceBoard ?? true)
  {
    await clearSourceBoardLivePublicTemplate(ctx, template)
  }
  return nextTemplate
}

export const markTemplateUnpublished = async (
  ctx: MutationCtx,
  template: Doc<'templates'>,
  now: number,
  options: { clearSourceBoard?: boolean } = {}
): Promise<void> =>
{
  await markTemplateNotPublic(ctx, template, now, 'unpublished', options)
}

export const setSourceBoardLivePublicTemplate = async (
  ctx: MutationCtx,
  sourceBoard: Doc<'boards'> | null,
  templateId: Id<'templates'>,
  now: number
): Promise<void> =>
{
  if (!sourceBoard) return
  if (sourceBoard.livePublicTemplateId === templateId) return

  if (
    sourceBoard.livePublicTemplateId !== null &&
    sourceBoard.livePublicTemplateId !== templateId
  )
  {
    const previous = await ctx.db.get(sourceBoard.livePublicTemplateId)
    if (previous)
    {
      await markTemplateUnpublished(ctx, previous, now, {
        clearSourceBoard: false,
      })
    }
  }

  await ctx.db.patch(sourceBoard._id, {
    livePublicTemplateId: templateId,
  })
}

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

export interface PublicCategoryDelta
{
  category: TemplateCategory
  delta: number
}

// batch-update both the total & per-category breakdown in a single read+write.
// pass one delta per category-transition so a category change publishes as
// `[{category: prev, delta: -1}, {category: next, delta: +1}]`
export const adjustPublicTemplateCount = async (
  ctx: MutationCtx,
  changes: readonly PublicCategoryDelta[]
): Promise<void> =>
{
  if (changes.length === 0)
  {
    return
  }
  const totalDelta = changes.reduce((sum, change) => sum + change.delta, 0)
  if (totalDelta === 0 && changes.every((change) => change.delta === 0))
  {
    return
  }

  const stats = await ctx.db
    .query('marketplaceStats')
    .withIndex('byKey', (q) => q.eq('key', MARKETPLACE_STATS_KEY))
    .unique()
  const nextCount = Math.max(0, (stats?.publicTemplateCount ?? 0) + totalDelta)

  const nextByCategory: Record<string, number> = {
    ...(stats?.publicTemplateCountByCategory ?? {}),
  }
  for (const { category, delta } of changes)
  {
    const updated = Math.max(0, (nextByCategory[category] ?? 0) + delta)
    if (updated === 0)
    {
      delete nextByCategory[category]
    }
    else
    {
      nextByCategory[category] = updated
    }
  }

  const now = Date.now()
  if (stats)
  {
    await ctx.db.patch(stats._id, {
      publicTemplateCount: nextCount,
      publicTemplateCountByCategory: nextByCategory,
      updatedAt: now,
    })
    return
  }

  await ctx.db.insert('marketplaceStats', {
    key: MARKETPLACE_STATS_KEY,
    publicTemplateCount: nextCount,
    publicTemplateCountByCategory: nextByCategory,
    updatedAt: now,
  })
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
  const cached = cache.stats.get(templateId)
  if (cached) return await cached
  const pending = ctx.db
    .query('templateStats')
    .withIndex('byTemplateId', (q) => q.eq('templateId', templateId))
    .unique()
  cache.stats.set(templateId, pending)
  return await pending
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

export const createTemplateStats = async (
  ctx: MutationCtx,
  templateId: Id<'templates'>,
  now: number
): Promise<TemplateStatsCounters> =>
{
  const stats = {
    forkCount: 0,
    viewCount: 0,
  }
  await ctx.db.insert('templateStats', {
    templateId,
    ...stats,
    updatedAt: now,
  })
  return stats
}

const deleteTemplateStatsIfExists = async (
  ctx: MutationCtx,
  templateId: Id<'templates'>
): Promise<void> =>
{
  const stats = await findTemplateStatsByTemplateId(ctx, templateId)
  if (stats)
  {
    await ctx.db.delete(stats._id)
  }
}

export const deleteTemplateStats = async (
  ctx: MutationCtx,
  templateId: Id<'templates'>
): Promise<void> =>
{
  const stats = await requireTemplateStats(ctx, templateId)
  await ctx.db.delete(stats._id)
}

const incrementTemplateMetricDay = async (
  ctx: MutationCtx,
  template: Pick<Doc<'templates'>, '_id' | 'category'>,
  now: number,
  metric: 'forkCount' | 'viewCount'
): Promise<void> =>
{
  const dayStartAt = getTemplateMetricDayStart(now)
  const existing = await ctx.db
    .query('templateMetricDays')
    .withIndex('byTemplateDay', (q) =>
      q.eq('templateId', template._id).eq('dayStartAt', dayStartAt)
    )
    .unique()

  if (existing)
  {
    await ctx.db.patch(existing._id, {
      category: template.category,
      [metric]: existing[metric] + 1,
      updatedAt: now,
    })
    return
  }

  await ctx.db.insert('templateMetricDays', {
    templateId: template._id,
    category: template.category,
    dayStartAt,
    forkCount: metric === 'forkCount' ? 1 : 0,
    viewCount: metric === 'viewCount' ? 1 : 0,
    createdAt: now,
    updatedAt: now,
  })
}

export const incrementTemplateForkStats = async (
  ctx: MutationCtx,
  templateId: Id<'templates'>,
  now: number
): Promise<TemplateStatsCounters> =>
{
  const template = await ctx.db.get(templateId)
  if (!template) return failState(`template missing: ${templateId}`)
  const [stats, card] = await Promise.all([
    requireTemplateStats(ctx, templateId),
    requireTemplateCardByTemplateId(ctx, templateId),
  ])
  const current = readTemplateCounters(stats)
  const next = {
    forkCount: current.forkCount + 1,
    viewCount: current.viewCount,
  }
  await Promise.all([
    ctx.db.patch(stats._id, {
      ...next,
      useCount: undefined,
      updatedAt: now,
    }),
    ctx.db.patch(card._id, {
      forkCount: next.forkCount,
      viewCount: next.viewCount,
      useCount: undefined,
    }),
    incrementTemplateMetricDay(ctx, template, now, 'forkCount'),
  ])
  return next
}

export const incrementTemplateViewStats = async (
  ctx: MutationCtx,
  template: Doc<'templates'>,
  now: number
): Promise<TemplateStatsCounters> =>
{
  const [stats, card] = await Promise.all([
    requireTemplateStats(ctx, template._id),
    requireTemplateCardByTemplateId(ctx, template._id),
  ])
  const current = readTemplateCounters(stats)
  const next = {
    forkCount: current.forkCount,
    viewCount: current.viewCount + 1,
  }
  await Promise.all([
    ctx.db.patch(stats._id, {
      ...next,
      useCount: undefined,
      updatedAt: now,
    }),
    ctx.db.patch(card._id, {
      forkCount: next.forkCount,
      viewCount: next.viewCount,
      useCount: undefined,
    }),
    incrementTemplateMetricDay(ctx, template, now, 'viewCount'),
  ])
  return next
}

export const deleteTemplateParentRow = async (
  ctx: MutationCtx,
  template: Doc<'templates'>
): Promise<void> =>
{
  await Promise.all([
    clearSourceBoardLivePublicTemplate(ctx, template),
    deleteTemplateCard(ctx, template._id),
    deleteTemplateStats(ctx, template._id),
  ])
  await ctx.db.delete(template._id)
}

export const deleteTemplateParentForCascade = async (
  ctx: MutationCtx,
  template: Doc<'templates'>
): Promise<void> =>
{
  if (isPublicTemplateRow(template))
  {
    await adjustPublicTemplateCount(ctx, [
      { category: template.category, delta: -1 },
    ])
  }
  await deleteTemplateParentRow(ctx, template)
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
  const cached = cache.assets.get(mediaAssetId)
  if (cached) return await cached
  const pending = ctx.db.get(mediaAssetId)
  cache.assets.set(mediaAssetId, pending)
  return await pending
}

const loadAssetUrl = async (
  ctx: DbCtx,
  storageId: Id<'_storage'>,
  cache?: TemplateProjectionCache
): Promise<string | null> =>
{
  if (!cache) return await ctx.storage.getUrl(storageId)
  const cached = cache.urls.get(storageId)
  if (cached) return await cached
  const pending = ctx.storage.getUrl(storageId)
  cache.urls.set(storageId, pending)
  return await pending
}

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
  return {
    externalId: asset.externalId,
    contentHash: variant.contentHash,
    url,
    width: variant.width,
    height: variant.height,
    mimeType: variant.mimeType,
  }
}

export const toTemplateMediaRef = async (
  ctx: DbCtx,
  mediaAssetId: Id<'mediaAssets'> | null,
  kind: MediaVariantKind,
  cache?: TemplateProjectionCache
): Promise<TemplateMediaRef | null> =>
{
  if (!mediaAssetId) return null
  const asset = await loadAsset(ctx, mediaAssetId, cache)
  if (!asset)
  {
    return failState(`dangling template media reference: ${mediaAssetId}`)
  }
  return await buildMediaRef(ctx, asset, kind, cache)
}

const toTemplateMediaRefWithFallback = async (
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
            label: item.label,
            backgroundColor: item.backgroundColor,
            aspectRatio: item.aspectRatio,
            imageFit: item.imageFit,
            transform: item.transform,
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

  const existing = cache.authors.get(authorId)
  if (existing)
  {
    return await existing
  }

  const pending = loadTemplateAuthor(ctx, authorId)
  cache.authors.set(authorId, pending)
  return await pending
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
            label: item.label,
            backgroundColor: item.backgroundColor,
            aspectRatio: item.aspectRatio,
            imageFit: item.imageFit,
            transform: item.transform,
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

const buildTemplateCardFields = async (
  ctx: DbCtx,
  template: TemplateCardSource,
  metrics: TemplateCardMetrics
): Promise<Omit<Doc<'templateCards'>, '_id' | '_creationTime'>> =>
{
  const author = await toTemplateCardAuthorFields(ctx, template.authorId)
  const cache = createTemplateProjectionCache()
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
    featuredRank: template.featuredRank,
    forkCount: metrics.forkCount,
    useCount: undefined,
    viewCount: metrics.viewCount,
    weeklyForkCount: metrics.weeklyForkCount,
    weeklyViewCount: metrics.weeklyViewCount,
    trendingScore: metrics.trendingScore,
    trendingComputedAt: metrics.trendingComputedAt,
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

const requireTemplateCardByTemplateId = async (
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

// upsert a card w/ explicit counters. used for fresh inserts (publish/seed)
// where stats are 0/0 or known, & during recompute where stats come from the
// authoritative templateStats row
export const writeTemplateCard = async (
  ctx: MutationCtx,
  template: TemplateCardSource,
  stats: LegacyForkCountSource
): Promise<void> =>
{
  const fields = await buildTemplateCardFields(
    ctx,
    template,
    getInitialTemplateCardMetrics(readTemplateCounters(stats))
  )
  const existing = await findTemplateCardByTemplateId(ctx, template._id)
  if (existing)
  {
    await ctx.db.patch(existing._id, fields)
    return
  }
  await ctx.db.insert('templateCards', fields)
}

// upsert a card while preserving its counters; counters live on templateCards
// for the gallery sort indexes so a parent-only patch (title/category/tags)
// must not zero them. falls back to templateStats only on first insert
export const writeTemplateCardPreservingCounters = async (
  ctx: MutationCtx,
  template: TemplateCardSource
): Promise<void> =>
{
  const card = await findTemplateCardByTemplateId(ctx, template._id)
  const metrics = card
    ? getTemplateCardMetrics(card)
    : getInitialTemplateCardMetrics(
        readTemplateCounters(await requireTemplateStats(ctx, template._id))
      )
  const fields = await buildTemplateCardFields(ctx, template, metrics)
  if (card)
  {
    await ctx.db.patch(card._id, fields)
    return
  }
  await ctx.db.insert('templateCards', fields)
}

export const patchTemplateAndSyncCard = async (
  ctx: MutationCtx,
  template: Doc<'templates'>,
  patch: TemplatePatch
): Promise<Doc<'templates'>> =>
{
  const normalizedPatch = normalizeTemplatePatchForWrite(patch)
  await ctx.db.patch(template._id, normalizedPatch)
  const nextTemplate = { ...template, ...normalizedPatch }
  await writeTemplateCardPreservingCounters(ctx, nextTemplate)
  return nextTemplate
}

export const patchTemplateAndSyncCardById = async (
  ctx: MutationCtx,
  templateId: Id<'templates'>,
  patch: TemplatePatch
): Promise<Doc<'templates'> | null> =>
{
  const template = await ctx.db.get(templateId)
  if (!template)
  {
    await Promise.all([
      deleteTemplateCardIfExists(ctx, templateId),
      deleteTemplateStatsIfExists(ctx, templateId),
    ])
    return null
  }
  return await patchTemplateAndSyncCard(ctx, template, patch)
}

const deleteTemplateCardIfExists = async (
  ctx: MutationCtx,
  templateId: Id<'templates'>
): Promise<void> =>
{
  const existing = await findTemplateCardByTemplateId(ctx, templateId)
  if (existing)
  {
    await ctx.db.delete(existing._id)
  }
}

export const deleteTemplateCard = async (
  ctx: MutationCtx,
  templateId: Id<'templates'>
): Promise<void> =>
{
  const existing = await requireTemplateCardByTemplateId(ctx, templateId)
  await ctx.db.delete(existing._id)
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
  return {
    externalId: media.externalId,
    contentHash: media.contentHash,
    url,
    width: media.width,
    height: media.height,
    mimeType: media.mimeType,
  }
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
        label: item.label,
        backgroundColor: item.backgroundColor,
        aspectRatio: item.aspectRatio,
        imageFit: item.imageFit,
        transform: item.transform,
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
    itemCount: card.itemCount,
    forkCount: counters.forkCount,
    viewCount: counters.viewCount,
    rankingCount: card.rankingCount ?? 0,
    weeklyForkCount: card.weeklyForkCount ?? 0,
    weeklyViewCount: card.weeklyViewCount ?? 0,
    trendingScore: card.trendingScore ?? 0,
    trendingComputedAt: card.trendingComputedAt ?? null,
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
  const metrics = card
    ? getTemplateCardMetrics(card)
    : getInitialTemplateCardMetrics(readTemplateCounters(stats))

  const counters = readTemplateCounters(stats)
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
    rankingCount: card?.rankingCount ?? 0,
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
  altText: item.altText,
  media: item.mediaAssetId
    ? await toTemplateMediaRef(ctx, item.mediaAssetId, 'tile', cache)
    : null,
  order: item.order,
  aspectRatio: item.aspectRatio,
  imageFit: item.imageFit,
  transform: item.transform,
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
  const coverMedia = await toTemplateMediaRef(
    ctx,
    template.coverMediaAssetId,
    'tile',
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

export const findTemplateBySlug = async (
  ctx: DbCtx,
  slug: string
): Promise<Doc<'templates'> | null> =>
  await ctx.db
    .query('templates')
    .withIndex('bySlug', (q) => q.eq('slug', slug))
    .unique()

// hard cap on tag-row reads; tags are bounded by MAX_TEMPLATE_TAGS at publish
// time so this only protects against drift if that cap is later relaxed
const TAG_ROW_READ_CAP = MAX_TEMPLATE_TAGS * 2

// rebuild the templateTags rows for a single template. used after publish &
// after any meta update — replace strategy is fine here because tag rows are
// bounded (<= 12 per template) & per-template metadata writes are infrequent
export const syncTemplateTagRows = async (
  ctx: MutationCtx,
  template: Pick<
    Doc<'templates'>,
    '_id' | 'tags' | 'category' | 'isPubliclyListable' | 'updatedAt'
  >
): Promise<{ deleted: number; inserted: number }> =>
{
  const existing = await ctx.db
    .query('templateTags')
    .withIndex('byTemplate', (q) => q.eq('templateId', template._id))
    .take(TAG_ROW_READ_CAP)
  await Promise.all(existing.map((row) => ctx.db.delete(row._id)))
  await Promise.all(
    template.tags.map((tag) =>
      ctx.db.insert('templateTags', {
        templateId: template._id,
        tag,
        category: template.category,
        isPubliclyListable: template.isPubliclyListable,
        updatedAt: template.updatedAt,
      })
    )
  )
  return { deleted: existing.length, inserted: template.tags.length }
}

// patch denormalized fields on every tag row of a template w/o touching the
// tag list itself. used by unpublish & visibility-only flips so we don't churn
// rows when the membership set is unchanged
export const patchTemplateTagRows = async (
  ctx: MutationCtx,
  templateId: Id<'templates'>,
  fields: {
    isPubliclyListable?: boolean
    updatedAt?: number
    category?: TemplateCategory
  }
): Promise<void> =>
{
  const rows = await ctx.db
    .query('templateTags')
    .withIndex('byTemplate', (q) => q.eq('templateId', templateId))
    .take(TAG_ROW_READ_CAP)
  await Promise.all(rows.map((row) => ctx.db.patch(row._id, fields)))
}

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

export const buildBoardItemInsertFromTemplateItem = (
  boardId: Id<'boards'>,
  item: Doc<'templateItems'>,
  externalId: string = generateItemId()
) => ({
  boardId,
  tierId: null,
  externalId,
  label: item.label ?? undefined,
  backgroundColor: item.backgroundColor ?? undefined,
  altText: item.altText ?? undefined,
  mediaAssetId: item.mediaAssetId,
  order: item.order,
  deletedAt: null,
  aspectRatio: item.aspectRatio ?? undefined,
  imageFit: item.imageFit ?? undefined,
  transform: item.transform ?? undefined,
  templateItemId: item._id,
})

export const insertBoardItemsFromTemplate = async (
  ctx: MutationCtx,
  boardId: Id<'boards'>,
  templateItems: readonly Doc<'templateItems'>[]
): Promise<BoardLibrarySummaryItem[]> =>
{
  const rows = await Promise.all(
    templateItems.map(async (item) =>
    {
      const storageId = item.mediaAssetId
        ? await loadMediaVariantStorageId(ctx, item.mediaAssetId)
        : null
      const externalId = generateItemId()

      return {
        insert: buildBoardItemInsertFromTemplateItem(boardId, item, externalId),
        summary: {
          tierKey: null,
          externalId,
          label: item.label,
          storageId,
          order: item.order,
          deletedAt: null,
        },
      }
    })
  )

  await Promise.all(rows.map((row) => ctx.db.insert('boardItems', row.insert)))
  return rows.map((row) => row.summary)
}
