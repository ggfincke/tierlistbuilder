// src/features/marketplace/model/useTemplatesGallery.ts
// composes the point-in-time gallery read, plus the reactive draft rail

import { useMemo } from 'react'
import {
  DEFAULT_TEMPLATE_LIST_LIMIT,
  DEFAULT_TEMPLATE_DRAFT_LIMIT,
  type MarketplaceTemplateDraft,
  type MarketplaceTemplateGalleryCard,
  type MarketplaceTemplateGalleryResult,
  type MarketplaceTemplateCount,
} from '@tierlistbuilder/contracts/marketplace/template'

import {
  getTemplatesGalleryImperative,
  useMyTemplateDrafts,
  type ListTemplatesArgs,
} from '~/features/marketplace/data/templatesRepository'
import type { GalleryFilters } from '~/features/marketplace/model/useGalleryFilters'
import { usePointInTimeQuery } from '~/shared/hooks/usePointInTimeQuery'
import { logger } from '~/shared/lib/logger'

interface TemplatesGalleryData
{
  featured: readonly MarketplaceTemplateGalleryCard[] | undefined
  popular: readonly MarketplaceTemplateGalleryCard[] | undefined
  recent: readonly MarketplaceTemplateGalleryCard[] | undefined
  drafts: readonly MarketplaceTemplateDraft[] | undefined
  results: readonly MarketplaceTemplateGalleryCard[] | undefined
  templateCount: MarketplaceTemplateCount | undefined
  refresh: () => Promise<void>
}

const onGalleryError = (error: unknown): void =>
{
  logger.warn('marketplace', 'getTemplatesGallery failed', error)
}

export const useTemplatesGallery = (
  filters: GalleryFilters,
  includeDrafts = false
): TemplatesGalleryData =>
{
  const isSearching = filters.searchDebounced.trim().length > 0
  const shouldLoadDrafts =
    includeDrafts && !isSearching && !filters.category && !filters.tag

  const galleryArgs = useMemo<ListTemplatesArgs>(
    () => ({
      search: filters.searchDebounced || null,
      sort: filters.sort,
      limit: DEFAULT_TEMPLATE_LIST_LIMIT,
      category: filters.category ?? null,
      tag: filters.tag ?? null,
    }),
    [filters.category, filters.searchDebounced, filters.sort, filters.tag]
  )

  const { data: snapshot, refresh } = usePointInTimeQuery<
    ListTemplatesArgs,
    MarketplaceTemplateGalleryResult
  >({
    args: galleryArgs,
    query: getTemplatesGalleryImperative,
    onError: onGalleryError,
  })

  const drafts = useMyTemplateDrafts(
    shouldLoadDrafts,
    DEFAULT_TEMPLATE_DRAFT_LIMIT
  )

  return {
    featured: snapshot?.featured,
    popular: snapshot?.popular,
    recent: snapshot?.recent,
    drafts: drafts?.drafts,
    results: snapshot?.results,
    templateCount: snapshot?.templateCount,
    refresh,
  }
}
