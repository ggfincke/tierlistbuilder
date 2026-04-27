// src/features/marketplace/model/useTemplatesGallery.ts
// composes the multi-rail gallery query — featured strip, popular & recent
// rails, & a filtered grid driven by gallery-filter state

import {
  DEFAULT_TEMPLATE_LIST_LIMIT,
  DEFAULT_TEMPLATE_DRAFT_LIMIT,
  type MarketplaceTemplateDraft,
  type MarketplaceTemplateSummary,
} from '@tierlistbuilder/contracts/marketplace/template'

import {
  useListTemplates,
  useMyTemplateDrafts,
  usePublicTemplateCount,
  type ListTemplatesArgs,
  type PublicTemplateCount,
} from '~/features/marketplace/data/templatesRepository'
import type { GalleryFilters } from '~/features/marketplace/model/useGalleryFilters'

export interface TemplatesGalleryData
{
  featured: readonly MarketplaceTemplateSummary[] | undefined
  popular: readonly MarketplaceTemplateSummary[] | undefined
  recent: readonly MarketplaceTemplateSummary[] | undefined
  drafts: readonly MarketplaceTemplateDraft[] | undefined
  results: readonly MarketplaceTemplateSummary[] | undefined
  templateCount: PublicTemplateCount | undefined
  isSearching: boolean
}

const FEATURED_LIMIT = 6
const RAIL_LIMIT = 12

export const useTemplatesGallery = (
  filters: GalleryFilters,
  includeDrafts = false
): TemplatesGalleryData =>
{
  const isSearching = filters.searchDebounced.trim().length > 0
  const shouldLoadDrafts =
    includeDrafts && !isSearching && !filters.category && !filters.tag

  // featured & rail queries are driven by sort, never by the search input —
  // those rails serve as wayfinding when the user clears the input
  const featuredArgs: ListTemplatesArgs = {
    sort: 'featured',
    limit: FEATURED_LIMIT,
    category: null,
  }
  const popularArgs: ListTemplatesArgs = {
    sort: 'popular',
    limit: RAIL_LIMIT,
    category: null,
  }
  const recentArgs: ListTemplatesArgs = {
    sort: 'recent',
    limit: RAIL_LIMIT,
    category: null,
  }
  const resultsArgs: ListTemplatesArgs = {
    search: filters.searchDebounced || null,
    sort: filters.sort,
    limit: DEFAULT_TEMPLATE_LIST_LIMIT,
    category: filters.category ?? null,
    tag: filters.tag ?? null,
  }

  const featured = useListTemplates(featuredArgs)
  const popular = useListTemplates(popularArgs)
  const recent = useListTemplates(recentArgs)
  const results = useListTemplates(resultsArgs)
  const templateCount = usePublicTemplateCount()
  const drafts = useMyTemplateDrafts(
    shouldLoadDrafts,
    DEFAULT_TEMPLATE_DRAFT_LIMIT
  )

  return {
    featured: featured?.items,
    popular: popular?.items,
    recent: recent?.items,
    drafts: drafts?.drafts,
    results: results?.items,
    templateCount,
    isSearching,
  }
}
