// src/features/library/model/useLibraryFilters.ts
// URL-driven filter / sort / view / density / search state for the My Lists page

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import {
  LIBRARY_BOARD_DENSITIES,
  LIBRARY_BOARD_FILTERS,
  LIBRARY_BOARD_SORTS,
  LIBRARY_BOARD_VIEWS,
  type LibraryBoardDensity,
  type LibraryBoardFilter,
  type LibraryBoardSort,
  type LibraryBoardView,
} from '@tierlistbuilder/contracts/workspace/board'

const SEARCH_DEBOUNCE_MS = 200

const DEFAULTS = {
  filter: 'all' as LibraryBoardFilter,
  sort: 'updated' as LibraryBoardSort,
  view: 'grid' as LibraryBoardView,
  density: 'default' as LibraryBoardDensity,
}

const isFilter = (value: string | null): value is LibraryBoardFilter =>
  typeof value === 'string' &&
  (LIBRARY_BOARD_FILTERS as readonly string[]).includes(value)

const isSort = (value: string | null): value is LibraryBoardSort =>
  typeof value === 'string' &&
  (LIBRARY_BOARD_SORTS as readonly string[]).includes(value)

const isView = (value: string | null): value is LibraryBoardView =>
  typeof value === 'string' &&
  (LIBRARY_BOARD_VIEWS as readonly string[]).includes(value)

const isDensity = (value: string | null): value is LibraryBoardDensity =>
  typeof value === 'string' &&
  (LIBRARY_BOARD_DENSITIES as readonly string[]).includes(value)

export interface LibraryFilters
{
  searchInput: string
  searchDebounced: string
  filter: LibraryBoardFilter
  sort: LibraryBoardSort
  view: LibraryBoardView
  density: LibraryBoardDensity
  setSearch: (next: string) => void
  setFilter: (next: LibraryBoardFilter) => void
  setSort: (next: LibraryBoardSort) => void
  setView: (next: LibraryBoardView) => void
  setDensity: (next: LibraryBoardDensity) => void
}

export const useLibraryFilters = (): LibraryFilters =>
{
  const [params, setParams] = useSearchParams()

  const initialSearch = params.get('q') ?? ''
  const initialFilter = isFilter(params.get('status'))
    ? (params.get('status') as LibraryBoardFilter)
    : DEFAULTS.filter
  const initialSort = isSort(params.get('sort'))
    ? (params.get('sort') as LibraryBoardSort)
    : DEFAULTS.sort
  const initialView = isView(params.get('view'))
    ? (params.get('view') as LibraryBoardView)
    : DEFAULTS.view
  const initialDensity = isDensity(params.get('density'))
    ? (params.get('density') as LibraryBoardDensity)
    : DEFAULTS.density

  const [searchInput, setSearchInput] = useState(initialSearch)
  const [searchDebounced, setSearchDebounced] = useState(initialSearch)
  const [filter, setFilterState] = useState<LibraryBoardFilter>(initialFilter)
  const [sort, setSortState] = useState<LibraryBoardSort>(initialSort)
  const [view, setViewState] = useState<LibraryBoardView>(initialView)
  const [density, setDensityState] =
    useState<LibraryBoardDensity>(initialDensity)

  // debounce search; preserves typing responsiveness while keeping reactive
  // filtered list stable
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

  // sync state back to the URL — only writes keys whose values diverge from
  // their defaults so the URL stays minimal for the common case
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

    const writeIfNonDefault = <T extends string>(
      key: string,
      value: T,
      defaultValue: T
    ) =>
    {
      const current = next.get(key)
      if (value !== defaultValue && value !== current)
      {
        next.set(key, value)
        changed = true
      }
      else if (value === defaultValue && current)
      {
        next.delete(key)
        changed = true
      }
    }

    writeIfNonDefault('status', filter, DEFAULTS.filter)
    writeIfNonDefault('sort', sort, DEFAULTS.sort)
    writeIfNonDefault('view', view, DEFAULTS.view)
    writeIfNonDefault('density', density, DEFAULTS.density)

    if (changed)
    {
      setParams(next, { replace: true })
    }
  }, [searchDebounced, filter, sort, view, density, params, setParams])

  const setSearch = useCallback((next: string) =>
  {
    setSearchInput(next)
  }, [])
  const setFilter = useCallback(
    (next: LibraryBoardFilter) => setFilterState(next),
    []
  )
  const setSort = useCallback(
    (next: LibraryBoardSort) => setSortState(next),
    []
  )
  const setView = useCallback(
    (next: LibraryBoardView) => setViewState(next),
    []
  )
  const setDensity = useCallback(
    (next: LibraryBoardDensity) => setDensityState(next),
    []
  )

  return {
    searchInput,
    searchDebounced,
    filter,
    sort,
    view,
    density,
    setSearch,
    setFilter,
    setSort,
    setView,
    setDensity,
  }
}
