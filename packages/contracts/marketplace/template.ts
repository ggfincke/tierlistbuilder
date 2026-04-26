// packages/contracts/marketplace/template.ts
// public template marketplace contracts shared by Convex & frontend slices

import type { TierPresetTier } from '../workspace/tierPreset'
import type { ImageFit, ItemTransform } from '../workspace/board'

export const TEMPLATE_CATEGORIES = [
  'gaming',
  'movies',
  'music',
  'food',
  'sports',
  'other',
] as const

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]

export const TEMPLATE_VISIBILITIES = ['public', 'unlisted'] as const

export type TemplateVisibility = (typeof TEMPLATE_VISIBILITIES)[number]

export const TEMPLATE_LIST_SORTS = ['featured', 'popular', 'recent'] as const

export type TemplateListSort = (typeof TEMPLATE_LIST_SORTS)[number]

export const MAX_TEMPLATE_TITLE_LENGTH = 80
export const MAX_TEMPLATE_DESCRIPTION_LENGTH = 500
export const MAX_TEMPLATE_CREDIT_LINE_LENGTH = 160
export const MAX_TEMPLATE_TAGS = 12
export const MAX_TEMPLATE_TAG_LENGTH = 32
export const MAX_TEMPLATE_LIST_LIMIT = 48
export const DEFAULT_TEMPLATE_LIST_LIMIT = 24
export const TEMPLATE_SLUG_LENGTH = 10

const TEMPLATE_SLUG_PATTERN = new RegExp(
  `^[0-9A-Za-z]{${TEMPLATE_SLUG_LENGTH}}$`
)

const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

export const isTemplateSlug = (value: unknown): value is string =>
  typeof value === 'string' && TEMPLATE_SLUG_PATTERN.test(value)

export const generateTemplateSlug = (): string =>
{
  let out = ''
  const buf = new Uint8Array(TEMPLATE_SLUG_LENGTH)
  while (out.length < TEMPLATE_SLUG_LENGTH)
  {
    crypto.getRandomValues(buf)
    for (const byte of buf)
    {
      if (byte >= 248) continue
      out += BASE62[byte % 62]
      if (out.length === TEMPLATE_SLUG_LENGTH) break
    }
  }
  return out
}

export interface TemplateAuthor
{
  id: string
  displayName: string
  avatarUrl: string | null
}

export interface TemplateMediaRef
{
  externalId: string
  contentHash: string
  url: string
  width: number
  height: number
  mimeType: string
}

export interface MarketplaceTemplateSummary
{
  slug: string
  title: string
  description: string | null
  category: TemplateCategory
  tags: string[]
  visibility: TemplateVisibility
  author: TemplateAuthor
  coverMedia: TemplateMediaRef | null
  itemCount: number
  useCount: number
  viewCount: number
  featuredRank: number | null
  creditLine: string | null
  createdAt: number
  updatedAt: number
  unpublishedAt: number | null
}

export interface MarketplaceTemplateItem
{
  externalId: string
  label: string | null
  backgroundColor: string | null
  altText: string | null
  media: TemplateMediaRef | null
  order: number
  aspectRatio: number | null
  imageFit: ImageFit | null
  transform: ItemTransform | null
}

export interface MarketplaceTemplateDetail extends MarketplaceTemplateSummary
{
  suggestedTiers: TierPresetTier[]
  items: MarketplaceTemplateItem[]
}

export interface MarketplaceTemplateListResult
{
  items: MarketplaceTemplateSummary[]
}

export interface MarketplaceTemplatePublishResult
{
  slug: string
}

export type TemplateUseTierSelection =
  | { kind: 'template' }
  | { kind: 'default' }
  | { kind: 'preset'; presetExternalId: string }
  | { kind: 'custom'; tiers: TierPresetTier[] }

export interface MarketplaceTemplateUseResult
{
  boardExternalId: string
}
