// src/features/marketplace/data/templatesRepository.ts
// frontend-only adapters for the public template marketplace

import type {
  MarketplaceTemplateDetail,
  MarketplaceTemplateDraftListResult,
  MarketplaceTemplateGalleryResult,
  MarketplaceTemplateItem,
  MarketplaceTemplateListResult,
  MarketplaceTemplatePublishResult,
  MarketplaceTemplateUseResult,
  TemplateListSort,
  TemplateUseTierSelection,
  TemplateVisibility,
} from '@tierlistbuilder/contracts/marketplace/template'
import type { TemplateCategory } from '@tierlistbuilder/contracts/marketplace/category'

export type TemplateItemsPageStatus =
  | 'LoadingFirstPage'
  | 'CanLoadMore'
  | 'LoadingMore'
  | 'Exhausted'

export interface TemplateItemsPage
{
  items: MarketplaceTemplateItem[]
  status: TemplateItemsPageStatus
  loadMore: (count?: number) => void
}

export interface ListTemplatesArgs
{
  search?: string | null
  category?: TemplateCategory | null
  tag?: string | null
  sort?: TemplateListSort
  limit?: number
}

const EMPTY_GALLERY: MarketplaceTemplateGalleryResult = {
  featured: [],
  popular: [],
  recent: [],
  results: [],
  templateCount: {
    count: 0,
    countByCategory: {},
  },
}

export const getTemplatesGalleryImperative = (
  _args: ListTemplatesArgs
): Promise<MarketplaceTemplateGalleryResult> => Promise.resolve(EMPTY_GALLERY)

export const useTemplateBySlug = (
  slug: string | null | undefined
): MarketplaceTemplateDetail | null | undefined =>
  typeof slug === 'string' && slug.length > 0 ? null : undefined

export const useTemplateItems = (
  slug: string | null | undefined
): TemplateItemsPage => ({
  items: [],
  status:
    typeof slug === 'string' && slug.length > 0
      ? 'Exhausted'
      : 'LoadingFirstPage',
  loadMore: () =>
  {},
})

interface RelatedTemplatesArgs
{
  slug: string
  limit?: number
}

export const useRelatedTemplates = (
  args: RelatedTemplatesArgs | 'skip'
): MarketplaceTemplateListResult | undefined =>
  args === 'skip' ? undefined : { items: [] }

export const useMyTemplateDrafts = (
  enabled: boolean,
  _limit?: number
): MarketplaceTemplateDraftListResult | undefined =>
  enabled ? { drafts: [] } : undefined

export interface PublishFromBoardArgs
{
  boardExternalId: string
  title: string
  description: string | null
  category: TemplateCategory
  tags: string[]
  visibility: TemplateVisibility
  coverMediaExternalId: string | null
  creditLine: string | null
}

export const usePublishFromBoardMutation =
  () =>
  async (
    _args: PublishFromBoardArgs
  ): Promise<MarketplaceTemplatePublishResult> =>
  {
    throw new Error(
      'Template publishing is unavailable in this frontend-only build.'
    )
  }

interface UseTemplateMutationArgs
{
  slug: string
  title?: string
  tierSelection?: TemplateUseTierSelection
}

export const useUseTemplateMutation =
  () =>
  async (
    _args: UseTemplateMutationArgs
  ): Promise<MarketplaceTemplateUseResult> =>
  {
    throw new Error(
      'Template forking is unavailable in this frontend-only build.'
    )
  }
