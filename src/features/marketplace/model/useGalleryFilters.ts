// src/features/marketplace/model/useGalleryFilters.ts
// debounced URL-driven filter state for the gallery — search + category + tag
// + sort. mirrors the controls in the page header so deep links preselect

import { useCallback, useEffect, useRef, useState } from 'react'
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

const isCategory = (value: string | null): value is TemplateCategory =>
  typeof value === 'string' &&
  (TEMPLATE_CATEGORIES as readonly string[]).includes(value)

const isSort = (value: string | null): value is TemplateListSort =>
  typeof value === 'string' &&
  (TEMPLATE_LIST_SORTS as readonly string[]).includes(value)

const normalizeTagFromUrl = (value: string | null): string | null =>
{
  if (typeof value !== 'string') return null
  const tag = value.trim().toLowerCase()
  if (!tag || tag.length > MAX_TEMPLATE_TAG_LENGTH) return null
  return tag
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

  const initialSearch = params.get('q') ?? ''
  const initialCategory = isCategory(params.get('cat'))
    ? (params.get('cat') as TemplateCategory)
    : null
  const initialTag = normalizeTagFromUrl(params.get('tag'))
  const initialSort = isSort(params.get('sort'))
    ? (params.get('sort') as TemplateListSort)
    : DEFAULT_SORT

  const [searchInput, setSearchInput] = useState(initialSearch)
  const [searchDebounced, setSearchDebounced] = useState(initialSearch)
  const [category, setCategoryState] = useState<TemplateCategory | null>(
    initialCategory
  )
  const [tag, setTagState] = useState<string | null>(initialTag)
  const [sort, setSortState] = useState<TemplateListSort>(initialSort)

  // debounce only the value used for queries; the input itself stays
  // immediately responsive so users see what they're typing
  const debounceRef = useRef<number | null>(null)
  useEffect(() =>
  {
    if (debounceRef.current !== null)
    {
      window.clearTimeout(debounceRef.current)
    }
    debounceRef.current = window.setTimeout(() =>
    {
      setSearchDebounced(searchInput)
    }, SEARCH_DEBOUNCE_MS)
    return () =>
    {
      if (debounceRef.current !== null)
      {
        window.clearTimeout(debounceRef.current)
      }
    }
  }, [searchInput])

  // sync filters back into the URL so deep-links & back/forward navigation
  // preserve them. only writes the keys actually in use to keep URLs tidy
  useEffect(() =>
  {
    const next = new URLSearchParams(params)
    let changed = false
    const wantQ = searchDebounced.trim()
    const currentQ = next.get('q') ?? ''
    if (wantQ && wantQ !== currentQ)
    {
      next.set('q', wantQ)
      changed = true
    }
    else if (!wantQ && currentQ)
    {
      next.delete('q')
      changed = true
    }
    const currentCat = next.get('cat')
    if (category && category !== currentCat)
    {
      next.set('cat', category)
      changed = true
    }
    else if (!category && currentCat)
    {
      next.delete('cat')
      changed = true
    }
    const currentTag = next.get('tag')
    if (tag && tag !== currentTag)
    {
      next.set('tag', tag)
      changed = true
    }
    else if (!tag && currentTag)
    {
      next.delete('tag')
      changed = true
    }
    const currentSort = next.get('sort')
    if (sort !== DEFAULT_SORT && sort !== currentSort)
    {
      next.set('sort', sort)
      changed = true
    }
    else if (sort === DEFAULT_SORT && currentSort)
    {
      next.delete('sort')
      changed = true
    }
    if (changed)
    {
      setParams(next, { replace: true })
    }
  }, [searchDebounced, category, tag, sort, params, setParams])

  const setSearch = useCallback((next: string) =>
  {
    setSearchInput(next)
  }, [])
  const setCategory = useCallback(
    (next: TemplateCategory | null) => setCategoryState(next),
    []
  )
  const setTag = useCallback(
    (next: string | null) => setTagState(normalizeTagFromUrl(next)),
    []
  )
  const setSort = useCallback(
    (next: TemplateListSort) => setSortState(next),
    []
  )

  return {
    searchInput,
    searchDebounced,
    category,
    tag,
    sort,
    setSearch,
    setCategory,
    setTag,
    setSort,
  }
}
