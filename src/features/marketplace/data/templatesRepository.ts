// src/features/marketplace/data/templatesRepository.ts
// frontend-only template adapters for the extracted UI shell

import type { TemplateCategory } from '@tierlistbuilder/contracts/marketplace/category'
import type {
  MarketplaceTemplateBookmarkState,
  MarketplaceTemplateDetail,
  MarketplaceTemplateDraftListResult,
  MarketplaceTemplateGalleryRailResult,
  MarketplaceTemplateGalleryResultsResult,
  MarketplaceTemplateItem,
  MarketplaceTemplateListResult,
  MarketplaceTemplateManagementListResult,
  MarketplaceTemplatePublishResult,
  MarketplaceTemplateUseResult,
  TemplateCoverFraming,
  TemplateGalleryRail,
  TemplateListSort,
  TemplateUseTierSelection,
  TemplateVisibility,
} from '@tierlistbuilder/contracts/marketplace/template'

export interface ListTemplatesArgs
{
  search?: string | null
  category?: TemplateCategory | null
  tag?: string | null
  sort?: TemplateListSort
  limit?: number
}

const serviceUnavailable = async (..._args: unknown[]): Promise<never> =>
{
  throw new Error('Template actions are not available in this UI-only build.')
}

export const getTemplateGalleryRailImperative = (
  _rail: TemplateGalleryRail
): Promise<MarketplaceTemplateGalleryRailResult> => serviceUnavailable()

export const getTemplateGalleryResultsImperative = (
  _args: ListTemplatesArgs
): Promise<MarketplaceTemplateGalleryResultsResult> => serviceUnavailable()

export const useTemplateBySlug = (
  _slug: string | null | undefined
): MarketplaceTemplateDetail | null | undefined => null

export const getTemplateBySlugImperative = (
  _slug: string
): Promise<MarketplaceTemplateDetail | null> => Promise.resolve(null)

export const loadAllTemplateItemsImperative = async (
  _slug: string
): Promise<MarketplaceTemplateItem[]> => []

interface RelatedTemplatesArgs
{
  slug: string
  limit?: number
}

export const useRelatedTemplates = (
  _args: RelatedTemplatesArgs | 'skip'
): MarketplaceTemplateListResult | undefined => undefined

export const useTemplateBookmarkState = (
  _templateSlug: string | null | undefined,
  _enabled = true
): MarketplaceTemplateBookmarkState | undefined => undefined

export const useToggleTemplateBookmarkMutation =
  () =>
  (_args: { templateSlug: string; saved: boolean }): Promise<never> =>
    serviceUnavailable(_args)

export const useMyTemplateDrafts = (
  _enabled: boolean,
  _limit?: number
): MarketplaceTemplateDraftListResult | undefined => undefined

export interface PublishFromBoardArgs
{
  boardExternalId: string
  title: string
  description: string | null
  category: TemplateCategory
  tags: string[]
  visibility: TemplateVisibility
  coverMediaExternalId?: string | null
  coverFraming?: TemplateCoverFraming | null
  creditLine: string | null
}

export const usePublishFromBoardMutation =
  () =>
  (_args: PublishFromBoardArgs): Promise<MarketplaceTemplatePublishResult> =>
    serviceUnavailable()

interface UseTemplateMutationArgs
{
  slug: string
  title?: string
  tierSelection?: TemplateUseTierSelection
  preferredCriterionExternalId?: string
}

export const useUseTemplateMutation =
  () =>
  (_args: UseTemplateMutationArgs): Promise<MarketplaceTemplateUseResult> =>
    serviceUnavailable()

export const recordTemplateViewImperative = (_slug: string): Promise<null> =>
  Promise.resolve(null)

export const useMyTemplateManagementList = (
  _enabled: boolean,
  _limit?: number
): MarketplaceTemplateManagementListResult | undefined => undefined

export const useUnpublishMyTemplateMutation =
  () =>
  (_args: { slug: string }): Promise<null> =>
    serviceUnavailable()

export const useRepublishMyTemplateMutation =
  () =>
  (_args: { slug: string }): Promise<null> =>
    serviceUnavailable()

export interface UpdateMyTemplateMetaArgs
{
  slug: string
  title?: string
  description?: string | null
  category?: TemplateCategory
  tags?: string[]
  visibility?: TemplateVisibility
  coverMediaExternalId?: string | null
  coverFraming?: TemplateCoverFraming | null
  creditLine?: string | null
}

export const useUpdateMyTemplateMetaMutation =
  () =>
  (_args: UpdateMyTemplateMetaArgs): Promise<null> =>
    serviceUnavailable()
