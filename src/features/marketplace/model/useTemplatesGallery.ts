// src/features/marketplace/model/useTemplatesGallery.ts
// composes the point-in-time gallery read, plus the reactive draft rail

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

  const [snapshot, setSnapshot] = useState<MarketplaceTemplateGalleryResult>()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const mountedRef = useRef(true)
  const requestIdRef = useRef(0)

  useEffect(() =>
  {
    mountedRef.current = true
    return () =>
    {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback(async () =>
  {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setIsRefreshing(true)

    try
    {
      const next = await getTemplatesGalleryImperative(galleryArgs)
      if (!mountedRef.current || requestId !== requestIdRef.current) return
      setSnapshot(next)
    }
    catch (error)
    {
      if (!mountedRef.current || requestId !== requestIdRef.current) return
      logger.warn('marketplace', 'getTemplatesGallery failed', error)
    }
    finally
    {
      if (mountedRef.current && requestId === requestIdRef.current)
      {
        setIsRefreshing(false)
      }
    }
  }, [galleryArgs])

  // Public cards are intentionally point-in-time. Keep the last snapshot
  // visible during refresh; route/filter changes decide when to reread.
  useEffect(() =>
  {
    void refresh()
  }, [includeDrafts, refresh])

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
