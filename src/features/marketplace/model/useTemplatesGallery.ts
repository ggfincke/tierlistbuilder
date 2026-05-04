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
  isSearching: boolean
  isRefreshing: boolean
  refresh: () => Promise<void>
}

interface TemplatesGalleryOptions
{
  includeDrafts?: boolean
  accessRefreshKey?: string
}

interface TemplatesGalleryQueryArgs
{
  accessRefreshKey: string
  queryArgs: ListTemplatesArgs
}

const onGalleryError = (error: unknown): void =>
{
  logger.warn('marketplace', 'getTemplatesGallery failed', error)
}

const getTemplatesGallerySnapshot = (
  args: TemplatesGalleryQueryArgs
): Promise<MarketplaceTemplateGalleryResult> =>
  getTemplatesGalleryImperative(args.queryArgs)

export const useTemplatesGallery = (
  filters: GalleryFilters,
  options: TemplatesGalleryOptions = {}
): TemplatesGalleryData =>
{
  const includeDrafts = options.includeDrafts ?? false
  const accessRefreshKey =
    options.accessRefreshKey ?? (includeDrafts ? 'signed-in' : 'signed-out')
  const isSearching = filters.searchDebounced.trim().length > 0
  const shouldLoadDrafts =
    includeDrafts && !isSearching && !filters.category && !filters.tag

  const galleryArgs = useMemo<TemplatesGalleryQueryArgs>(
    () => ({
      accessRefreshKey,
      queryArgs: {
        search: filters.searchDebounced || null,
        sort: filters.sort,
        limit: DEFAULT_TEMPLATE_LIST_LIMIT,
        category: filters.category ?? null,
        tag: filters.tag ?? null,
      },
    }),
    [
      accessRefreshKey,
      filters.category,
      filters.searchDebounced,
      filters.sort,
      filters.tag,
    ]
  )

  const {
    data: snapshot,
    isRefreshing,
    refresh,
  } = usePointInTimeQuery<
    TemplatesGalleryQueryArgs,
    MarketplaceTemplateGalleryResult
  >({
    args: galleryArgs,
    query: getTemplatesGallerySnapshot,
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
    isSearching,
    isRefreshing,
    refresh,
  }
}
