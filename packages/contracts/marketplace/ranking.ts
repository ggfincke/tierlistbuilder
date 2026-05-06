// packages/contracts/marketplace/ranking.ts
// public ranking contracts shared by Convex & future marketplace UI

import type { TierColorSpec } from '../lib/theme'
import type { ImageFit, ItemTransform } from '../workspace/board'
import type { TemplateAuthor, TemplateMediaRef } from './template'
import type { TemplateCategory } from './category'

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
] as const

export type RankingPublishBlockReason =
  (typeof RANKING_PUBLISH_BLOCK_REASONS)[number]

export const MAX_RANKING_TITLE_LENGTH = 80
export const MAX_RANKING_DESCRIPTION_LENGTH = 500
export const DEFAULT_RANKING_LIST_LIMIT = 24
export const MAX_RANKING_LIST_LIMIT = 48
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

export interface MarketplaceRankingTemplateRef
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
  itemCount: number
  tierCount: number
  remixCount: number
  viewCount: number
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
