// src/features/library/model/useLibraryFilters.ts
// URL-canonical filter, sort, view, density, & search state for My Lists

import { useCallback, useEffect, useState } from 'react'
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

const DEFAULT_LIBRARY_FILTER_PARAMS = {
  filter: 'all' as LibraryBoardFilter,
  sort: 'updated' as LibraryBoardSort,
  view: 'grid' as LibraryBoardView,
  density: 'default' as LibraryBoardDensity,
}

export interface LibraryFilterParams
{
  search: string
  filter: LibraryBoardFilter
  sort: LibraryBoardSort
  view: LibraryBoardView
  density: LibraryBoardDensity
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

const normalizeSearchFromUrl = (value: string | null): string =>
  typeof value === 'string' ? value : ''

const writeDefaultedParam = <T extends string>(
  params: URLSearchParams,
  key: string,
  value: T,
  defaultValue: T
) =>
{
  if (value === defaultValue)
  {
    params.delete(key)
    return
  }
  params.set(key, value)
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

export const parseLibraryFilterParams = (
  params: URLSearchParams
): LibraryFilterParams =>
{
  const filterParam = params.get('status')
  const sortParam = params.get('sort')
  const viewParam = params.get('view')
  const densityParam = params.get('density')

  return {
    search: normalizeSearchFromUrl(params.get('q')),
    filter: isFilter(filterParam)
      ? filterParam
      : DEFAULT_LIBRARY_FILTER_PARAMS.filter,
    sort: isSort(sortParam) ? sortParam : DEFAULT_LIBRARY_FILTER_PARAMS.sort,
    view: isView(viewParam) ? viewParam : DEFAULT_LIBRARY_FILTER_PARAMS.view,
    density: isDensity(densityParam)
      ? densityParam
      : DEFAULT_LIBRARY_FILTER_PARAMS.density,
  }
}

export const createLibraryFilterSearchParams = (
  current: URLSearchParams,
  patch: Partial<LibraryFilterParams>
): URLSearchParams =>
{
  const nextFilters = {
    ...parseLibraryFilterParams(current),
    ...patch,
  }
  const next = new URLSearchParams(current)

  writeSearchParam(next, nextFilters.search)
  writeDefaultedParam(
    next,
    'status',
    nextFilters.filter,
    DEFAULT_LIBRARY_FILTER_PARAMS.filter
  )
  writeDefaultedParam(
    next,
    'sort',
    nextFilters.sort,
    DEFAULT_LIBRARY_FILTER_PARAMS.sort
  )
  writeDefaultedParam(
    next,
    'view',
    nextFilters.view,
    DEFAULT_LIBRARY_FILTER_PARAMS.view
  )
  writeDefaultedParam(
    next,
    'density',
    nextFilters.density,
    DEFAULT_LIBRARY_FILTER_PARAMS.density
  )

  return next
}

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
  const filters = parseLibraryFilterParams(params)
  const [searchDebounced, setSearchDebounced] = useState(filters.search.trim())
  const paramsKey = params.toString()

  const commitFilters = useCallback(
    (
      patch: Partial<LibraryFilterParams>,
      options?: Parameters<typeof setParams>[1]
    ) =>
    {
      const next = createLibraryFilterSearchParams(params, patch)
      if (next.toString() !== params.toString())
      {
        setParams(next, options)
      }
    },
    [params, setParams]
  )

  useEffect(() =>
  {
    const next = createLibraryFilterSearchParams(params, {})
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
  const setFilter = useCallback(
    (next: LibraryBoardFilter) => commitFilters({ filter: next }),
    [commitFilters]
  )
  const setSort = useCallback(
    (next: LibraryBoardSort) => commitFilters({ sort: next }),
    [commitFilters]
  )
  const setView = useCallback(
    (next: LibraryBoardView) => commitFilters({ view: next }),
    [commitFilters]
  )
  const setDensity = useCallback(
    (next: LibraryBoardDensity) => commitFilters({ density: next }),
    [commitFilters]
  )

  return {
    searchInput: filters.search,
    searchDebounced,
    filter: filters.filter,
    sort: filters.sort,
    view: filters.view,
    density: filters.density,
    setSearch,
    setFilter,
    setSort,
    setView,
    setDensity,
  }
}
