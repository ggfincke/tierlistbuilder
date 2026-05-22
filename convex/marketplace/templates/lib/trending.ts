// convex/marketplace/templates/lib/trending.ts
// trending-score math, metric-day bucketing, projection cache, & counter types

import type { Doc, Id } from '../../../_generated/dataModel'
import type { TemplateAuthor } from '@tierlistbuilder/contracts/marketplace/template'

export type TemplateStatsCounters = {
  forkCount: number
  viewCount: number
}
export type TemplateCardMetrics = TemplateStatsCounters & {
  weeklyForkCount: number
  weeklyViewCount: number
  trendingScore: number
  trendingComputedAt: number | null
  rankingCount: number
}

export type TemplateCounterSource = {
  forkCount: number
  viewCount?: number
}

export const readTemplateCounters = (
  source: TemplateCounterSource
): TemplateStatsCounters => ({
  forkCount: source.forkCount,
  viewCount:
    typeof source.viewCount === 'number' && Number.isFinite(source.viewCount)
      ? source.viewCount
      : 0,
})

export interface TemplateProjectionCache
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

export const MARKETPLACE_STATS_KEY = 'templates'
export const TEMPLATE_TRENDING_WINDOW_DAYS = 7
export const TEMPLATE_TRENDING_DAY_MS = 24 * 60 * 60 * 1000
const TEMPLATE_TRENDING_NEWNESS_DAYS = 14
const TEMPLATE_TRENDING_FORK_WEIGHT = 100
const TEMPLATE_TRENDING_VIEW_WEIGHT = 5
const TEMPLATE_TRENDING_RECENCY_WEIGHT = 2

export const getTemplateMetricDayStart = (now: number): number =>
  Math.floor(now / TEMPLATE_TRENDING_DAY_MS) * TEMPLATE_TRENDING_DAY_MS

export const getTemplateCardMetrics = (
  card: Pick<
    Doc<'templateCards'>,
    | 'forkCount'
    | 'viewCount'
    | 'weeklyForkCount'
    | 'weeklyViewCount'
    | 'trendingScore'
    | 'trendingComputedAt'
    | 'rankingCount'
  >
): TemplateCardMetrics => ({
  ...readTemplateCounters(card),
  weeklyForkCount: card.weeklyForkCount,
  weeklyViewCount: card.weeklyViewCount,
  trendingScore: card.trendingScore,
  trendingComputedAt: card.trendingComputedAt,
  rankingCount: card.rankingCount,
})

export const getInitialTemplateCardMetrics = (
  stats: TemplateStatsCounters
): TemplateCardMetrics => ({
  ...stats,
  weeklyForkCount: 0,
  weeklyViewCount: 0,
  trendingScore: 0,
  trendingComputedAt: null,
  rankingCount: 0,
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
