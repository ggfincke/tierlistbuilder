// src/features/marketplace/model/useGalleryFilters.ts
// debounced URL-driven filter state for the gallery — search + category +
// sort. mirrors the controls in the page header so deep links can preselect

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import {
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

export interface GalleryFilters
{
  searchInput: string
  searchDebounced: string
  category: TemplateCategory | null
  sort: TemplateListSort
  setSearch: (next: string) => void
  setCategory: (next: TemplateCategory | null) => void
  setSort: (next: TemplateListSort) => void
}

export const useGalleryFilters = (): GalleryFilters =>
{
  const [params, setParams] = useSearchParams()

  const initialSearch = params.get('q') ?? ''
  const initialCategory = isCategory(params.get('cat'))
    ? (params.get('cat') as TemplateCategory)
    : null
  const initialSort = isSort(params.get('sort'))
    ? (params.get('sort') as TemplateListSort)
    : DEFAULT_SORT

  const [searchInput, setSearchInput] = useState(initialSearch)
  const [searchDebounced, setSearchDebounced] = useState(initialSearch)
  const [category, setCategoryState] = useState<TemplateCategory | null>(
    initialCategory
  )
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
  }, [searchDebounced, category, sort, params, setParams])

  const setSearch = useCallback((next: string) =>
  {
    setSearchInput(next)
  }, [])
  const setCategory = useCallback(
    (next: TemplateCategory | null) => setCategoryState(next),
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
    sort,
    setSearch,
    setCategory,
    setSort,
  }
}
