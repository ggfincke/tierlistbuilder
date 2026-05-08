// packages/contracts/marketplace/ranking.ts
// public ranking contracts shared by Convex & future marketplace UI

import type { TierColorSpec } from '../lib/theme'
import type { ImageFit, ItemTransform } from '../workspace/board'
import type { TemplateAuthor, TemplateMediaRef } from './template'
import type { TemplateCategory } from './category'
import type { PaginationResult } from '../lib/pagination'
import type { MarketplaceTemplateCriterionSnapshot } from './templateCriterion'

export const RANKING_VISIBILITIES = ['public', 'unlisted'] as const

export type RankingVisibility = (typeof RANKING_VISIBILITIES)[number]

export const RANKING_PUBLICATION_STATES = ['published', 'unpublished'] as const

export type RankingPublicationState =
  (typeof RANKING_PUBLICATION_STATES)[number]

export const RANKING_PUBLISH_BLOCK_REASONS = [
  'sign_in_required',
  'not_found',
  'board_deleted',
  'syncing',
  'not_template_backed',
  'incomplete',
  'source_template_unpublished',
  'criterion_not_found',
  'criterion_not_publishable',
] as const

export type RankingPublishBlockReason =
  (typeof RANKING_PUBLISH_BLOCK_REASONS)[number]

export const RANKING_LIST_SORTS = ['recent', 'top', 'featured'] as const

export type RankingListSort = (typeof RANKING_LIST_SORTS)[number]

// editorial badge applied to featured rankings — displayed alongside the
// crown chip on the rail. add new badges here as the curation set grows
export const RANKING_FEATURED_BADGES = [
  'official',
  'editorial',
  'tournament',
  'creator',
] as const

export type RankingFeaturedBadge = (typeof RANKING_FEATURED_BADGES)[number]

export const RANKING_FEATURED_BADGE_LABELS: Record<
  RankingFeaturedBadge,
  string
> = {
  official: 'Official',
  editorial: 'Editorial',
  tournament: 'Tournament',
  creator: 'Creator',
}

export const MAX_RANKING_TITLE_LENGTH = 80
export const MAX_RANKING_DESCRIPTION_LENGTH = 500
export const DEFAULT_RANKING_LIST_LIMIT = 24
export const MAX_RANKING_LIST_LIMIT = 48
export const RANKING_TOP_SCORE_REMIX_WEIGHT = 5
const RANKING_SLUG_LENGTH = 10

const RANKING_SLUG_PATTERN = new RegExp(`^[0-9A-Za-z]{${RANKING_SLUG_LENGTH}}$`)

const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

export const isRankingSlug = (value: unknown): value is string =>
  typeof value === 'string' && RANKING_SLUG_PATTERN.test(value)

export const generateRankingSlug = (): string =>
{
  let out = ''
  const buf = new Uint8Array(RANKING_SLUG_LENGTH)
  while (out.length < RANKING_SLUG_LENGTH)
  {
    crypto.getRandomValues(buf)
    for (const byte of buf)
    {
      if (byte >= 248) continue
      out += BASE62[byte % 62]
      if (out.length === RANKING_SLUG_LENGTH) break
    }
  }
  return out
}

interface MarketplaceRankingTemplateRef
{
  slug: string
  title: string
  category: TemplateCategory
}

export interface MarketplaceRankingSummary
{
  slug: string
  title: string
  description: string | null
  visibility: RankingVisibility
  publicationState: RankingPublicationState
  author: TemplateAuthor
  template: MarketplaceRankingTemplateRef
  criterion: MarketplaceTemplateCriterionSnapshot
  itemCount: number
  tierCount: number
  remixCount: number
  viewCount: number
  // featured curation — null for ordinary rankings; lower rank surfaces first
  featuredRank: number | null
  featuredBadge: RankingFeaturedBadge | null
  createdAt: number
  updatedAt: number
}

export interface MarketplaceRankingTier
{
  externalId: string
  name: string
  description: string | null
  colorSpec: TierColorSpec
  rowColorSpec: TierColorSpec | null
  order: number
}

export interface MarketplaceRankingItem
{
  externalId: string
  templateItemExternalId: string
  tierExternalId: string | null
  label: string | null
  backgroundColor: string | null
  altText: string | null
  media: TemplateMediaRef | null
  order: number
  aspectRatio: number | null
  imageFit: ImageFit | null
  transform: ItemTransform | null
}

export interface MarketplaceRankingDetail extends MarketplaceRankingSummary
{
  tiers: MarketplaceRankingTier[]
  items: MarketplaceRankingItem[]
}

export interface MarketplaceRankingListResult
{
  items: MarketplaceRankingSummary[]
}

export type MarketplaceRankingPaginatedResult =
  PaginationResult<MarketplaceRankingSummary>

export interface MarketplaceRankingPublishResult
{
  slug: string
}

export interface MarketplaceRankingRemixResult
{
  boardExternalId: string
}

export interface MarketplaceRankingPublishAvailability
{
  canPublish: boolean
  reason: RankingPublishBlockReason | null
  message: string | null
  activeItemCount: number
  unrankedItemCount: number
  sourceTemplateTitle: string | null
}

export interface MarketplaceMyRankingForTemplateResult
{
  ranking: MarketplaceRankingSummary | null
  placements: Record<string, number>
}

const normalizeBucketLabel = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, ' ')

const normalizeBucketFamily = (value: string): string =>
  normalizeBucketLabel(value)
    .replace(/\s*[+-]+$/, '')
    .trim()

const targetBucketIndexByLabel = (
  labels: readonly string[] | undefined
): Map<string, number> =>
{
  const map = new Map<string, number>()
  labels?.forEach((label, index) =>
  {
    const normalized = normalizeBucketLabel(label)
    const family = normalizeBucketFamily(label)
    if (normalized && !map.has(normalized)) map.set(normalized, index)
    if (family && normalized === family && !map.has(family))
    {
      map.set(family, index)
    }
  })
  return map
}

export const buildRankingTierBucketMap = <
  Tier extends { externalId: string; order: number; name?: string | null },
>(
  tiers: readonly Tier[],
  bucketCount: number,
  targetBucketLabels?: readonly string[]
): Map<string, number> =>
{
  const map = new Map<string, number>()
  if (bucketCount <= 0) return map
  const labelMap = targetBucketIndexByLabel(targetBucketLabels)
  tiers
    .slice()
    .sort((a, b) => a.order - b.order)
    .forEach((tier, index) =>
    {
      const fallback = Math.min(index, bucketCount - 1)
      const label = tier.name ?? ''
      const exact = labelMap.get(normalizeBucketLabel(label))
      const family = labelMap.get(normalizeBucketFamily(label))
      map.set(tier.externalId, exact ?? family ?? fallback)
    })
  return map
}

export const buildRankingBucketPlacements = <
  Tier extends { externalId: string; order: number; name?: string | null },
  Item extends {
    templateItemExternalId: string
    tierExternalId: string | null
  },
>(
  tiers: readonly Tier[],
  items: readonly Item[],
  bucketCount: number,
  targetBucketLabels?: readonly string[]
): Record<string, number> =>
{
  if (bucketCount <= 0) return {}
  const bucketByTier = buildRankingTierBucketMap(
    tiers,
    bucketCount,
    targetBucketLabels
  )
  const placements: Record<string, number> = {}
  for (const item of items)
  {
    if (item.tierExternalId === null) continue
    const bucketIndex = bucketByTier.get(item.tierExternalId)
    if (bucketIndex === undefined) continue
    placements[item.templateItemExternalId] = bucketIndex
  }
  return placements
}
