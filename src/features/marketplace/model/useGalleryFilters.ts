// src/features/marketplace/model/useGalleryFilters.ts
// URL-canonical filter state for gallery search, category, tag, & sort

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import {
  MAX_TEMPLATE_TAG_LENGTH,
  TEMPLATE_CATEGORIES,
  TEMPLATE_LIST_SORTS,
  type TemplateCategory,
  type TemplateListSort,
} from '@tierlistbuilder/contracts/marketplace/template'

const SEARCH_DEBOUNCE_MS = 250
const DEFAULT_SORT: TemplateListSort = 'recent'

export interface GalleryFilterParams
{
  search: string
  category: TemplateCategory | null
  tag: string | null
  sort: TemplateListSort
}

const isCategory = (value: string | null): value is TemplateCategory =>
  typeof value === 'string' &&
  (TEMPLATE_CATEGORIES as readonly string[]).includes(value)

const isSort = (value: string | null): value is TemplateListSort =>
  typeof value === 'string' &&
  (TEMPLATE_LIST_SORTS as readonly string[]).includes(value)

const normalizeSearchFromUrl = (value: string | null): string =>
  typeof value === 'string' ? value : ''

const normalizeTagFromUrl = (value: string | null): string | null =>
{
  if (typeof value !== 'string') return null
  const tag = value.trim().toLowerCase()
  if (!tag || tag.length > MAX_TEMPLATE_TAG_LENGTH) return null
  return tag
}

const writeOptionalParam = (
  params: URLSearchParams,
  key: string,
  value: string | null
) =>
{
  if (value)
  {
    params.set(key, value)
    return
  }
  params.delete(key)
}

const writeSearchParam = (params: URLSearchParams, value: string) =>
{
  if (value.trim())
  {
    params.set('q', value)
    return
  }
  params.delete('q')
}

export const parseGalleryFilterParams = (
  params: URLSearchParams
): GalleryFilterParams =>
{
  const categoryParam = params.get('cat')
  const sortParam = params.get('sort')

  return {
    search: normalizeSearchFromUrl(params.get('q')),
    category: isCategory(categoryParam) ? categoryParam : null,
    tag: normalizeTagFromUrl(params.get('tag')),
    sort: isSort(sortParam) ? sortParam : DEFAULT_SORT,
  }
}

export const createGalleryFilterSearchParams = (
  current: URLSearchParams,
  patch: Partial<GalleryFilterParams>
): URLSearchParams =>
{
  const nextFilters = {
    ...parseGalleryFilterParams(current),
    ...patch,
  }
  const next = new URLSearchParams(current)

  writeSearchParam(next, nextFilters.search)
  writeOptionalParam(next, 'cat', nextFilters.category)
  writeOptionalParam(next, 'tag', normalizeTagFromUrl(nextFilters.tag))

  if (nextFilters.sort === DEFAULT_SORT)
  {
    next.delete('sort')
  }
  else
  {
    next.set('sort', nextFilters.sort)
  }

  return next
}

export interface GalleryFilters
{
  searchInput: string
  searchDebounced: string
  category: TemplateCategory | null
  tag: string | null
  sort: TemplateListSort
  setSearch: (next: string) => void
  setCategory: (next: TemplateCategory | null) => void
  setTag: (next: string | null) => void
  setSort: (next: TemplateListSort) => void
}

export const useGalleryFilters = (): GalleryFilters =>
{
  const [params, setParams] = useSearchParams()
  const filters = parseGalleryFilterParams(params)
  const [searchDebounced, setSearchDebounced] = useState(filters.search.trim())
  const paramsKey = params.toString()

  const commitFilters = useCallback(
    (
      patch: Partial<GalleryFilterParams>,
      options?: Parameters<typeof setParams>[1]
    ) =>
    {
      const next = createGalleryFilterSearchParams(params, patch)
      if (next.toString() !== params.toString())
      {
        setParams(next, options)
      }
    },
    [params, setParams]
  )

  useEffect(() =>
  {
    const next = createGalleryFilterSearchParams(params, {})
    if (next.toString() !== paramsKey)
    {
      setParams(next, { replace: true })
    }
  }, [params, paramsKey, setParams])

  useEffect(() =>
  {
    const nextSearch = filters.search.trim()
    if (searchDebounced === nextSearch) return
    const timeout = window.setTimeout(() =>
    {
      setSearchDebounced(nextSearch)
    }, SEARCH_DEBOUNCE_MS)
    return () =>
    {
      window.clearTimeout(timeout)
    }
  }, [filters.search, searchDebounced])

  const setSearch = useCallback(
    (next: string) =>
    {
      commitFilters({ search: next }, { replace: true })
    },
    [commitFilters]
  )
  const setCategory = useCallback(
    (next: TemplateCategory | null) => commitFilters({ category: next }),
    [commitFilters]
  )
  const setTag = useCallback(
    (next: string | null) => commitFilters({ tag: normalizeTagFromUrl(next) }),
    [commitFilters]
  )
  const setSort = useCallback(
    (next: TemplateListSort) => commitFilters({ sort: next }),
    [commitFilters]
  )

  return {
    searchInput: filters.search,
    searchDebounced,
    category: filters.category,
    tag: filters.tag,
    sort: filters.sort,
    setSearch,
    setCategory,
    setTag,
    setSort,
  }
}
