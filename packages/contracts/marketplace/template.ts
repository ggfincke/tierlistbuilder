// packages/contracts/marketplace/template.ts
// public template marketplace contracts shared by frontend slices

import type { TierPresetTier } from '../workspace/tierPreset'
import type {
  BoardAutoPlateSettings,
  BoardLabelSettings,
  ImageFit,
  ItemTransform,
  MediaPlate,
} from '../workspace/board'
import type { PaginationResult } from '../lib/pagination'
import type { TemplateCategory } from './category'
import type { MarketplaceTemplateCriterion } from './templateCriterion'

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

const FINISHED_TEMPLATE_JOB_STATUSES = [
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

export const TEMPLATE_LIST_SORTS = [
  'featured',
  'trending',
  'popular',
  'recent',
] as const

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

// per-surface cover framings — authors crop a single master image per surface.
// rect coords are normalized against source dimensions; higher-res replacements
// keep framing. values may sit outside [0, 1] when zoomed below cover-fit
export const COVER_SURFACES = ['browseHero', 'detailHero', 'card'] as const

export type CoverSurface = (typeof COVER_SURFACES)[number]

// canonical aspect ratios per surface — gallery hero ~16:9, detail hero ~4:3,
// default card ~16:10. live containers may drift; FramedCoverImage covers
// via object-cover
export const SURFACE_ASPECT_RATIOS: Record<CoverSurface, number> = {
  browseHero: 16 / 9,
  detailHero: 4 / 3,
  card: 16 / 10,
}

export interface CoverFrame
{
  x: number
  y: number
  width: number
  height: number
}

export interface TemplateCoverFraming
{
  browseHero: CoverFrame | null
  detailHero: CoverFrame | null
  card: CoverFrame | null
}

export const FULL_COVER_FRAME: CoverFrame = { x: 0, y: 0, width: 1, height: 1 }

// frames are normalized to source-image coords but may extend outside [0, 1]
// when the user zooms out below cover-fit -> renderer letterboxes the gap
// w/ --t-media-matte. only finite + positive extents are required
export const isValidCoverFrame = (frame: CoverFrame): boolean =>
  Number.isFinite(frame.x) &&
  Number.isFinite(frame.y) &&
  Number.isFinite(frame.width) &&
  Number.isFinite(frame.height) &&
  frame.width > 0 &&
  frame.height > 0

export interface TemplateCoverItem
{
  media: TemplateMediaRef
  label: string | null
  backgroundColor: string | null
  mediaPlate: MediaPlate | null
  aspectRatio: number | null
  imageFit: ImageFit | null
  transform: ItemTransform | null
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
  // per-surface framings of coverMedia. null when coverMedia is null OR when
  // the author hasn't framed for any surface yet (runtime falls back to
  // full-image object-cover into the surface container)
  coverFraming: TemplateCoverFraming | null
  itemCount: number
  forkCount: number
  viewCount: number
  // total public published rankings across every criterion (denormalized)
  rankingCount: number
  weeklyForkCount: number
  weeklyViewCount: number
  trendingScore: number
  trendingComputedAt: number | null
  featuredRank: number | null
  creditLine: string | null
  createdAt: number
  updatedAt: number
}

export interface MarketplaceTemplateSummary extends MarketplaceTemplateBase
{
  // first MAX_TEMPLATE_COVER_ITEMS media-backed items in template order
  coverItems: TemplateCoverItem[]
  // slot aspect ratio (w/h) the template was designed against; null falls back
  // to 1 (square). mirrored on summary so gallery cards can frame cover tiles
  // identically to the detail item grid w/o a detail read
  itemAspectRatio: number | null
  // board-wide fit pinned by the publisher; null falls back to 'cover'
  defaultItemImageFit: ImageFit | null
  // per-board logo backdrop pinned by the publisher; null -> On+Auto default
  autoPlate: BoardAutoPlateSettings | null
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
  trending: MarketplaceTemplateGalleryCard[]
  popular: MarketplaceTemplateGalleryCard[]
  recent: MarketplaceTemplateGalleryCard[]
  results: MarketplaceTemplateGalleryCard[]
  templateCount: MarketplaceTemplateCount
}

export const TEMPLATE_GALLERY_RAILS = [
  'featured',
  'trending',
  'popular',
  'recent',
] as const

export type TemplateGalleryRail = (typeof TEMPLATE_GALLERY_RAILS)[number]

export interface MarketplaceTemplateGalleryRailResult
{
  items: MarketplaceTemplateGalleryCard[]
}

export interface MarketplaceTemplateGalleryResultsResult
{
  results: MarketplaceTemplateGalleryCard[]
  templateCount: MarketplaceTemplateCount
}

export interface MarketplaceTemplateManagementItem extends MarketplaceTemplateSummary
{
  isPubliclyListable: boolean
}

export interface MarketplaceTemplateManagementListResult
{
  items: MarketplaceTemplateManagementItem[]
}

export interface MarketplaceTemplateDraftTemplate
{
  slug: string
  title: string
  category: TemplateCategory
  coverMedia: TemplateMediaRef | null
  coverFraming: TemplateCoverFraming | null
  coverItems: TemplateCoverItem[]
}

export interface MarketplaceTemplateItem
{
  externalId: string
  label: string | null
  backgroundColor: string | null
  mediaPlate: MediaPlate | null
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
  criteria: MarketplaceTemplateCriterion[]
  // public-listable ranking count per criterion external id; criteria w/o
  // an aggregate row yet appear as 0. only includes entries from `criteria`
  rankingCountByCriterion: Record<string, number>
  suggestedTiers: TierPresetTier[]
  // pre-baked board label settings; null falls back to the forking user's
  // global showLabels + built-in defaults
  labels: BoardLabelSettings | null
}

export type MarketplaceTemplateItemsResult =
  PaginationResult<MarketplaceTemplateItem>

export interface MarketplaceTemplateBookmarkState
{
  saved: boolean
  savedAt: number | null
}

export type MarketplaceTemplateBookmarkToggleResult =
  MarketplaceTemplateBookmarkState

export interface MarketplaceTemplateBookmarkListItem
{
  template: MarketplaceTemplateSummary
  savedAt: number
}

export type MarketplaceTemplateBookmarkListResult =
  PaginationResult<MarketplaceTemplateBookmarkListItem>

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

interface MarketplaceTemplateJobProgress
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
