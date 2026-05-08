// src/features/marketplace/model/useTemplatesGallery.ts
// composes the point-in-time gallery read, plus the reactive draft rail

import { useCallback, useMemo } from 'react'
import {
  DEFAULT_TEMPLATE_LIST_LIMIT,
  DEFAULT_TEMPLATE_DRAFT_LIMIT,
  type MarketplaceTemplateDraft,
  type MarketplaceTemplateGalleryCard,
  type MarketplaceTemplateGalleryRailResult,
  type MarketplaceTemplateGalleryResultsResult,
  type MarketplaceTemplateCount,
  type TemplateGalleryRail,
} from '@tierlistbuilder/contracts/marketplace/template'

import {
  getTemplateGalleryRailImperative,
  getTemplateGalleryResultsImperative,
  useMyTemplateDrafts,
  type ListTemplatesArgs,
} from '~/features/marketplace/data/templatesRepository'
import type { GalleryFilters } from '~/features/marketplace/model/useGalleryFilters'
import { usePointInTimeQuery } from '~/features/marketplace/model/usePointInTimeQuery'
import { logger } from '~/shared/lib/logger'

interface TemplatesGalleryData
{
  featured: readonly MarketplaceTemplateGalleryCard[] | undefined
  trending: readonly MarketplaceTemplateGalleryCard[] | undefined
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

interface TemplatesGalleryRailArgs
{
  accessRefreshKey: string
  rail: TemplateGalleryRail
}

const onGalleryError = (error: unknown): void =>
{
  logger.warn('marketplace', 'template gallery query failed', error)
}

const getTemplateGalleryResultsSnapshot = (
  args: TemplatesGalleryQueryArgs
): Promise<MarketplaceTemplateGalleryResultsResult> =>
  getTemplateGalleryResultsImperative(args.queryArgs)

const getTemplateGalleryRailSnapshot = (
  args: TemplatesGalleryRailArgs
): Promise<MarketplaceTemplateGalleryRailResult> =>
  getTemplateGalleryRailImperative(args.rail)

const useTemplateGalleryRail = (
  rail: TemplateGalleryRail,
  accessRefreshKey: string,
  enabled: boolean
) =>
{
  const args = useMemo<TemplatesGalleryRailArgs>(
    () => ({ accessRefreshKey, rail }),
    [accessRefreshKey, rail]
  )
  return usePointInTimeQuery<
    TemplatesGalleryRailArgs,
    MarketplaceTemplateGalleryRailResult
  >({
    args,
    query: getTemplateGalleryRailSnapshot,
    onError: onGalleryError,
    enabled,
  })
}

export const useTemplatesGallery = (
  filters: GalleryFilters,
  options: TemplatesGalleryOptions = {}
): TemplatesGalleryData =>
{
  const includeDrafts = options.includeDrafts ?? false
  const accessRefreshKey =
    options.accessRefreshKey ?? (includeDrafts ? 'signed-in' : 'signed-out')
  const isSearching = filters.searchDebounced.trim().length > 0
  const filtersActive =
    isSearching || filters.category !== null || filters.tag !== null
  const shouldLoadRails = !filtersActive
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
    data: resultsSnapshot,
    isRefreshing: resultsRefreshing,
    refresh: refreshResults,
  } = usePointInTimeQuery<
    TemplatesGalleryQueryArgs,
    MarketplaceTemplateGalleryResultsResult
  >({
    args: galleryArgs,
    query: getTemplateGalleryResultsSnapshot,
    onError: onGalleryError,
  })
  const {
    data: featuredSnapshot,
    isRefreshing: featuredRefreshing,
    refresh: refreshFeatured,
  } = useTemplateGalleryRail('featured', accessRefreshKey, shouldLoadRails)
  const {
    data: trendingSnapshot,
    isRefreshing: trendingRefreshing,
    refresh: refreshTrending,
  } = useTemplateGalleryRail('trending', accessRefreshKey, shouldLoadRails)
  const {
    data: popularSnapshot,
    isRefreshing: popularRefreshing,
    refresh: refreshPopular,
  } = useTemplateGalleryRail('popular', accessRefreshKey, shouldLoadRails)
  const {
    data: recentSnapshot,
    isRefreshing: recentRefreshing,
    refresh: refreshRecent,
  } = useTemplateGalleryRail('recent', accessRefreshKey, shouldLoadRails)

  const drafts = useMyTemplateDrafts(
    shouldLoadDrafts,
    DEFAULT_TEMPLATE_DRAFT_LIMIT
  )
  const refresh = useCallback(async (): Promise<void> =>
  {
    await Promise.all([
      refreshResults(),
      ...(shouldLoadRails
        ? [
            refreshFeatured(),
            refreshTrending(),
            refreshPopular(),
            refreshRecent(),
          ]
        : []),
    ])
  }, [
    refreshFeatured,
    refreshPopular,
    refreshRecent,
    refreshResults,
    refreshTrending,
    shouldLoadRails,
  ])
  const isRefreshing =
    resultsRefreshing ||
    (shouldLoadRails &&
      (featuredRefreshing ||
        trendingRefreshing ||
        popularRefreshing ||
        recentRefreshing))

  return {
    featured: featuredSnapshot?.items,
    trending: trendingSnapshot?.items,
    popular: popularSnapshot?.items,
    recent: recentSnapshot?.items,
    drafts: drafts?.drafts,
    results: resultsSnapshot?.results,
    templateCount: resultsSnapshot?.templateCount,
    isSearching,
    isRefreshing,
    refresh,
  }
}
