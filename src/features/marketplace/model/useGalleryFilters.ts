// src/features/marketplace/model/useGalleryFilters.ts
// URL-canonical filter state for gallery search, category, tag, & sort

import { useCallback } from 'react'

import {
  MAX_TEMPLATE_TAG_LENGTH,
  TEMPLATE_LIST_SORTS,
  type TemplateListSort,
} from '@tierlistbuilder/contracts/marketplace/template'
import {
  TEMPLATE_CATEGORIES,
  type TemplateCategory,
} from '@tierlistbuilder/contracts/marketplace/category'
import {
  createPatchedSearchParams,
  isStringMember,
  readSearchParam,
  useUrlFilterParams,
  writeOptionalParam,
  writeSearchParam,
} from '~/shared/catalog/urlFilters'

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
  isStringMember(value, TEMPLATE_CATEGORIES)

const isSort = (value: string | null): value is TemplateListSort =>
  isStringMember(value, TEMPLATE_LIST_SORTS)

const normalizeTagFromUrl = (value: string | null): string | null =>
{
  if (typeof value !== 'string') return null
  const tag = value.trim().toLowerCase()
  if (!tag || tag.length > MAX_TEMPLATE_TAG_LENGTH) return null
  return tag
}

export const parseGalleryFilterParams = (
  params: URLSearchParams
): GalleryFilterParams =>
{
  const categoryParam = params.get('cat')
  const sortParam = params.get('sort')

  return {
    search: readSearchParam(params.get('q')),
    category: isCategory(categoryParam) ? categoryParam : null,
    tag: normalizeTagFromUrl(params.get('tag')),
    sort: isSort(sortParam) ? sortParam : DEFAULT_SORT,
  }
}

const writeGalleryFilterParams = (
  params: URLSearchParams,
  filters: GalleryFilterParams
): void =>
{
  writeSearchParam(params, 'q', filters.search)
  writeOptionalParam(params, 'cat', filters.category)
  writeOptionalParam(params, 'tag', normalizeTagFromUrl(filters.tag))

  if (filters.sort === DEFAULT_SORT)
  {
    params.delete('sort')
    return
  }
  params.set('sort', filters.sort)
}

export const createGalleryFilterSearchParams = (
  current: URLSearchParams,
  patch: Partial<GalleryFilterParams>
): URLSearchParams =>
  createPatchedSearchParams(
    current,
    patch,
    parseGalleryFilterParams,
    writeGalleryFilterParams
  )

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
  const { filters, searchDebounced, commitFilters } = useUrlFilterParams({
    debounceMs: SEARCH_DEBOUNCE_MS,
    parse: parseGalleryFilterParams,
    create: createGalleryFilterSearchParams,
  })

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
