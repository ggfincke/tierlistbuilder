// src/features/marketplace/data/templatesRepository.ts
// Convex query/mutation adapters for the public template marketplace

import { useMutation, useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import type {
  MarketplaceTemplateDetail,
  MarketplaceTemplateDraftListResult,
  MarketplaceTemplateGalleryResult,
  MarketplaceTemplateBookmarkState,
  MarketplaceTemplateListResult,
  MarketplaceTemplateManagementListResult,
  MarketplaceTemplatePublishResult,
  MarketplaceTemplateUseResult,
  TemplateListSort,
  TemplateUseTierSelection,
  TemplateVisibility,
} from '@tierlistbuilder/contracts/marketplace/template'
import type { TemplateCategory } from '@tierlistbuilder/contracts/marketplace/category'
import { getConvexClient } from '~/features/platform/sync/lib/convexClient'

export interface ListTemplatesArgs
{
  search?: string | null
  category?: TemplateCategory | null
  // canonical lowercase tag — server normalizes & null-coerces over-length
  // values so the gallery falls back to the unfiltered listing path
  tag?: string | null
  sort?: TemplateListSort
  limit?: number
}

// point-in-time public gallery snapshot. the caller decides when to refresh;
// drafts & owner-specific state stay on reactive queries.
export const getTemplatesGalleryImperative = (
  args: ListTemplatesArgs
): Promise<MarketplaceTemplateGalleryResult> =>
  getConvexClient().query(
    api.marketplace.templates.queries.getTemplatesGallery,
    args
  )

// reactive detail metadata query — item rows load through pagination below
export const useTemplateBySlug = (
  slug: string | null | undefined
): MarketplaceTemplateDetail | null | undefined =>
  useQuery(
    api.marketplace.templates.queries.getTemplateBySlug,
    typeof slug === 'string' && slug.length > 0 ? { slug } : 'skip'
  )

interface RelatedTemplatesArgs
{
  slug: string
  limit?: number
}

// fed by the detail-page footer rail. category is derived server-side from
// the slug so the rail stays correct even if the parent detail row mutates
export const useRelatedTemplates = (
  args: RelatedTemplatesArgs | 'skip'
): MarketplaceTemplateListResult | undefined =>
  useQuery(
    api.marketplace.templates.queries.getRelatedTemplates,
    args === 'skip' ? 'skip' : args
  )

export const useTemplateBookmarkState = (
  templateSlug: string | null | undefined,
  enabled = true
): MarketplaceTemplateBookmarkState | undefined =>
  useQuery(
    api.marketplace.templates.bookmarks.getTemplateBookmarkState,
    enabled && typeof templateSlug === 'string' && templateSlug.length > 0
      ? { templateSlug }
      : 'skip'
  )

export const useToggleTemplateBookmarkMutation = () =>
  useMutation(api.marketplace.templates.bookmarks.toggleTemplateBookmark)

export const useMyTemplateDrafts = (
  enabled: boolean,
  limit?: number
): MarketplaceTemplateDraftListResult | undefined =>
  useQuery(
    api.marketplace.templates.queries.getMyTemplateDrafts,
    enabled ? (limit === undefined ? {} : { limit }) : 'skip'
  )

export interface PublishFromBoardArgs
{
  boardExternalId: string
  title: string
  description: string | null
  category: TemplateCategory
  tags: string[]
  visibility: TemplateVisibility
  coverMediaExternalId?: string | null
  creditLine: string | null
}

export const usePublishFromBoardMutation = () =>
  useMutation(
    api.marketplace.templates.mutations.publishFromBoard
  ) as unknown as (
    args: PublishFromBoardArgs
  ) => Promise<MarketplaceTemplatePublishResult>

interface UseTemplateMutationArgs
{
  slug: string
  title?: string
  tierSelection?: TemplateUseTierSelection
}

export const useUseTemplateMutation = () =>
  useMutation(api.marketplace.templates.mutations.useTemplate) as unknown as (
    args: UseTemplateMutationArgs
  ) => Promise<MarketplaceTemplateUseResult>

// imperative form — fire-&-forget once per detail-page session window. the
// repo layer keeps the dedup-storage concern out of the page component
export const recordTemplateViewImperative = (slug: string): Promise<null> =>
  getConvexClient().mutation(
    api.marketplace.templates.mutations.recordTemplateView,
    { slug }
  )

// owned-template management list. reactive so unpublish/republish toggles
// reflect immediately in the AccountModal section
export const useMyTemplateManagementList = (
  enabled: boolean,
  limit?: number
): MarketplaceTemplateManagementListResult | undefined =>
  useQuery(
    api.marketplace.templates.queries.getMyTemplateManagementList,
    enabled ? (limit === undefined ? {} : { limit }) : 'skip'
  )

export const useUnpublishMyTemplateMutation = () =>
  useMutation(
    api.marketplace.templates.mutations.unpublishMyTemplate
  ) as unknown as (args: { slug: string }) => Promise<null>

export const useRepublishMyTemplateMutation = () =>
  useMutation(
    api.marketplace.templates.mutations.republishMyTemplate
  ) as unknown as (args: { slug: string }) => Promise<null>

export interface UpdateMyTemplateMetaArgs
{
  slug: string
  title?: string
  description?: string | null
  category?: TemplateCategory
  tags?: string[]
  visibility?: TemplateVisibility
  coverMediaExternalId?: string | null
  creditLine?: string | null
}

export const useUpdateMyTemplateMetaMutation = () =>
  useMutation(
    api.marketplace.templates.mutations.updateMyTemplateMeta
  ) as unknown as (args: UpdateMyTemplateMetaArgs) => Promise<null>
