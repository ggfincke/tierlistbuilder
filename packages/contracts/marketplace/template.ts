// packages/contracts/marketplace/template.ts
// public template marketplace contracts shared by Convex & frontend slices

import type { TierPresetTier } from '../workspace/tierPreset'
import type {
  BoardLabelSettings,
  ImageFit,
  ItemTransform,
} from '../workspace/board'
import type { TemplateCategory } from './category'

export const TEMPLATE_VISIBILITIES = ['public', 'unlisted'] as const

export type TemplateVisibility = (typeof TEMPLATE_VISIBILITIES)[number]

export const TEMPLATE_SIZE_CLASSES = ['standard', 'large'] as const

export type TemplateSizeClass = (typeof TEMPLATE_SIZE_CLASSES)[number]

export const TEMPLATE_PUBLICATION_STATES = [
  'publishPending',
  'published',
  'publishFailed',
  'unpublished',
] as const

export type TemplatePublicationState =
  (typeof TEMPLATE_PUBLICATION_STATES)[number]

export const TEMPLATE_JOB_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'canceled',
] as const

export type TemplateJobStatus = (typeof TEMPLATE_JOB_STATUSES)[number]

export const ACTIVE_TEMPLATE_JOB_STATUSES = [
  'queued',
  'running',
] as const satisfies readonly TemplateJobStatus[]

export const FINISHED_TEMPLATE_JOB_STATUSES = [
  'succeeded',
  'canceled',
] as const satisfies readonly TemplateJobStatus[]

const ACTIVE_TEMPLATE_JOB_STATUS_SET: ReadonlySet<TemplateJobStatus> = new Set(
  ACTIVE_TEMPLATE_JOB_STATUSES
)

const FINISHED_TEMPLATE_JOB_STATUS_SET: ReadonlySet<TemplateJobStatus> =
  new Set(FINISHED_TEMPLATE_JOB_STATUSES)

export const isActiveTemplateJobStatus = (status: TemplateJobStatus): boolean =>
  ACTIVE_TEMPLATE_JOB_STATUS_SET.has(status)

export const isFinishedTemplateJobStatus = (
  status: TemplateJobStatus
): boolean => FINISHED_TEMPLATE_JOB_STATUS_SET.has(status)

export const TEMPLATE_LIST_SORTS = ['featured', 'popular', 'recent'] as const

export type TemplateListSort = (typeof TEMPLATE_LIST_SORTS)[number]

export const TEMPLATE_CARD_ACCESS_STATES = [
  'usable',
  'requiresPlus',
  'featureNotReady',
] as const

export type TemplateCardAccessState =
  (typeof TEMPLATE_CARD_ACCESS_STATES)[number]

export const MAX_TEMPLATE_TITLE_LENGTH = 80
export const MAX_TEMPLATE_DESCRIPTION_LENGTH = 500
export const MAX_TEMPLATE_CREDIT_LINE_LENGTH = 160
export const MAX_TEMPLATE_TAGS = 12
export const MAX_TEMPLATE_TAG_LENGTH = 32
export const MAX_TEMPLATE_LIST_LIMIT = 48
export const DEFAULT_TEMPLATE_LIST_LIMIT = 24
export const DEFAULT_TEMPLATE_ITEM_PAGE_SIZE = 100
export const MAX_TEMPLATE_ITEM_PAGE_SIZE = 200
export const DEFAULT_TEMPLATE_DRAFT_LIMIT = 8
export const MAX_TEMPLATE_DRAFT_LIMIT = 24
const TEMPLATE_SLUG_LENGTH = 10

// max images denormalized onto summaries; cards render a mosaic without
// per-card detail reads. ceiling matches the densest hero grid (6x4)
// so big rosters fill the card instead of leaving empty cells
export const MAX_TEMPLATE_COVER_ITEMS = 24

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

export interface TemplateCoverItem
{
  media: TemplateMediaRef
  label: string | null
}

export interface MarketplaceTemplateBase
{
  slug: string
  title: string
  description: string | null
  category: TemplateCategory
  tags: string[]
  visibility: TemplateVisibility
  sizeClass: TemplateSizeClass
  publicationState: TemplatePublicationState
  author: TemplateAuthor
  coverMedia: TemplateMediaRef | null
  itemCount: number
  useCount: number
  viewCount: number
  featuredRank: number | null
  creditLine: string | null
  createdAt: number
  updatedAt: number
}

export interface MarketplaceTemplateSummary extends MarketplaceTemplateBase
{
  // first MAX_TEMPLATE_COVER_ITEMS media-backed items in template order
  coverItems: TemplateCoverItem[]
}

export interface MarketplaceTemplateGalleryCard extends MarketplaceTemplateSummary
{
  access: TemplateCardAccessState
}

export interface MarketplaceTemplateCount
{
  count: number
  countByCategory: Record<string, number>
}

export interface MarketplaceTemplateGalleryResult
{
  featured: MarketplaceTemplateGalleryCard[]
  popular: MarketplaceTemplateGalleryCard[]
  recent: MarketplaceTemplateGalleryCard[]
  results: MarketplaceTemplateGalleryCard[]
  templateCount: MarketplaceTemplateCount
}

export interface MarketplaceTemplateDraftTemplate
{
  slug: string
  title: string
  category: TemplateCategory
  coverMedia: TemplateMediaRef | null
  coverItems: TemplateCoverItem[]
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
  access: TemplateCardAccessState
  suggestedTiers: TierPresetTier[]
  // slot aspect ratio (w/h) the template was designed against — gallery thumbs
  // & forked boards use this so per-item transforms frame correctly. null when
  // the template predates the field; callers should fall back to 1 (square)
  itemAspectRatio: number | null
  // board-wide fit pinned by the publisher; null falls back to 'cover'
  defaultItemImageFit: ImageFit | null
  // pre-baked board label settings; null falls back to the forking user's
  // global showLabels + built-in defaults
  labels: BoardLabelSettings | null
}

export interface MarketplaceTemplateItemsResult
{
  page: MarketplaceTemplateItem[]
  continueCursor: string
  isDone: boolean
  splitCursor?: string | null
  pageStatus?: 'SplitRecommended' | 'SplitRequired' | null
}

export interface MarketplaceTemplateListResult
{
  items: MarketplaceTemplateSummary[]
}

export interface MarketplaceTemplateDraft
{
  boardExternalId: string
  boardTitle: string
  updatedAt: number
  activeItemCount: number
  rankedItemCount: number
  unrankedItemCount: number
  progressPercent: number
  template: MarketplaceTemplateDraftTemplate
}

export interface MarketplaceTemplateDraftListResult
{
  drafts: MarketplaceTemplateDraft[]
}

export interface MarketplaceTemplateJobProgress
{
  jobId: string
  status: TemplateJobStatus
  itemCount: number
  processedItemCount: number
  errorCode: string | null
  createdAt: number
  updatedAt: number
  startedAt: number | null
  completedAt: number | null
  canceledAt: number | null
}

export interface MarketplaceTemplatePublishJobProgress extends MarketplaceTemplateJobProgress
{
  kind: 'publish'
  slug: string
}

export interface MarketplaceTemplateCloneJobProgress extends MarketplaceTemplateJobProgress
{
  kind: 'clone'
  boardExternalId: string
}

export type MarketplaceTemplatePublishResult =
  | {
      status: 'published'
      slug: string
    }
  | {
      status: 'jobQueued'
      slug: string
      jobId: string
    }

export type MarketplaceTemplateUseResult =
  | {
      status: 'ready'
      boardExternalId: string
    }
  | {
      status: 'jobQueued'
      boardExternalId: string
      jobId: string
    }

export type TemplateUseTierSelection =
  | { kind: 'template' }
  | { kind: 'default' }
  | { kind: 'preset'; presetExternalId: string }
  | { kind: 'custom'; tiers: TierPresetTier[] }
