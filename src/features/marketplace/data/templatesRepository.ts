// src/features/marketplace/data/templatesRepository.ts
// Convex query/mutation adapters for the public template marketplace

import { useMutation, useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import type {
  MarketplaceTemplateDetail,
  MarketplaceTemplateDraftListResult,
  MarketplaceTemplateGalleryRailResult,
  MarketplaceTemplateGalleryResultsResult,
  MarketplaceTemplateBookmarkState,
  MarketplaceTemplateItem,
  MarketplaceTemplateItemsResult,
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
import { DEFAULT_TEMPLATE_ITEM_PAGE_SIZE } from '@tierlistbuilder/contracts/marketplace/template'
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

export const getTemplateGalleryRailImperative = (
  rail: TemplateGalleryRail
): Promise<MarketplaceTemplateGalleryRailResult> =>
  getConvexClient().query(
    api.marketplace.templates.queries.getTemplateGalleryRail,
    { rail }
  )

export const getTemplateGalleryResultsImperative = (
  args: ListTemplatesArgs
): Promise<MarketplaceTemplateGalleryResultsResult> =>
  getConvexClient().query(
    api.marketplace.templates.queries.getTemplateGalleryResults,
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

// imperative variant for the local-fork path — fetches the full template
// detail in a single round trip when the caller doesn't have a reactive
// subscription handy (eg signed-out fork CTAs that don't keep detail live)
export const getTemplateBySlugImperative = (
  slug: string
): Promise<MarketplaceTemplateDetail | null> =>
  getConvexClient().query(api.marketplace.templates.queries.getTemplateBySlug, {
    slug,
  })

// paginated imperative fetch — used by the local-fork flow to collect every
// template item without leaning on reactive pagination. caps the page size at
// the contract-default to stay friendly w/ convex query limits
export const listTemplateItemsImperative = async (
  slug: string,
  paginationOpts: { cursor: string | null; numItems: number }
): Promise<MarketplaceTemplateItemsResult> =>
  getConvexClient().query(api.marketplace.templates.queries.listTemplateItems, {
    slug,
    paginationOpts,
  })

// drain every template item page-by-page until exhausted. bounded by the
// upstream query's per-page cap; safe for standard-size templates (≤200 items)
// & large templates routed through the same path (caller decides cap)
export const loadAllTemplateItemsImperative = async (
  slug: string
): Promise<MarketplaceTemplateItem[]> =>
{
  const items: MarketplaceTemplateItem[] = []
  let cursor: string | null = null
  while (true)
  {
    const result: MarketplaceTemplateItemsResult =
      await listTemplateItemsImperative(slug, {
        cursor,
        numItems: DEFAULT_TEMPLATE_ITEM_PAGE_SIZE,
      })
    items.push(...result.page)
    if (result.isDone) return items
    cursor = result.continueCursor
  }
}

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
  coverFraming?: TemplateCoverFraming | null
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
  // criterion the user was viewing when they forked — surfaced as the
  // publish-modal default. server discards it if it doesn't match an
  // active criterion on the source template
  preferredCriterionExternalId?: string
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
  coverFraming?: TemplateCoverFraming | null
  creditLine?: string | null
}

export const useUpdateMyTemplateMetaMutation = () =>
  useMutation(
    api.marketplace.templates.mutations.updateMyTemplateMeta
  ) as unknown as (args: UpdateMyTemplateMetaArgs) => Promise<null>
