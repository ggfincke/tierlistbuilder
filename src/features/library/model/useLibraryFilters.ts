// src/features/library/model/useLibraryFilters.ts
// URL-canonical filter, sort, view, density, & search state for My Boards

import {
  LIBRARY_BOARD_DENSITIES,
  LIBRARY_BOARD_FILTERS,
  LIBRARY_BOARD_SORTS,
  LIBRARY_BOARD_VIEWS,
  type LibraryBoardDensity,
  type LibraryBoardFilter,
  type LibraryBoardSort,
  type LibraryBoardView,
} from '@tierlistbuilder/contracts/workspace/libraryBoard'

import {
  createPatchedSearchParams,
  isStringMember,
  readSearchParam,
  useFilterSetters,
  useUrlFilterParams,
  writeDefaultedParam,
  writeSearchParam,
} from '~/shared/catalog/urlFilters'

const SEARCH_DEBOUNCE_MS = 200

const DEFAULT_LIBRARY_FILTER_PARAMS = {
  filter: 'all' as LibraryBoardFilter,
  sort: 'updated' as LibraryBoardSort,
  view: 'grid' as LibraryBoardView,
  density: 'default' as LibraryBoardDensity,
}

interface LibraryFilterParams
{
  search: string
  filter: LibraryBoardFilter
  sort: LibraryBoardSort
  view: LibraryBoardView
  density: LibraryBoardDensity
}

// URL filter parsing accepts any LIBRARY_BOARD_FILTERS member — every publish
// state (draft/wip/live) has a visible chip, so deep links & chips stay in sync
const isFilter = (value: string | null): value is LibraryBoardFilter =>
  isStringMember(value, LIBRARY_BOARD_FILTERS)

const isSort = (value: string | null): value is LibraryBoardSort =>
  isStringMember(value, LIBRARY_BOARD_SORTS)

const isView = (value: string | null): value is LibraryBoardView =>
  isStringMember(value, LIBRARY_BOARD_VIEWS)

const isDensity = (value: string | null): value is LibraryBoardDensity =>
  isStringMember(value, LIBRARY_BOARD_DENSITIES)

const parseLibraryFilterParams = (
  params: URLSearchParams
): LibraryFilterParams =>
{
  const filterParam = params.get('status')
  const sortParam = params.get('sort')
  const viewParam = params.get('view')
  const densityParam = params.get('density')

  return {
    search: readSearchParam(params.get('q')),
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

const writeLibraryFilterParams = (
  params: URLSearchParams,
  filters: LibraryFilterParams
): void =>
{
  writeSearchParam(params, 'q', filters.search)
  writeDefaultedParam(
    params,
    'status',
    filters.filter,
    DEFAULT_LIBRARY_FILTER_PARAMS.filter
  )
  writeDefaultedParam(
    params,
    'sort',
    filters.sort,
    DEFAULT_LIBRARY_FILTER_PARAMS.sort
  )
  writeDefaultedParam(
    params,
    'view',
    filters.view,
    DEFAULT_LIBRARY_FILTER_PARAMS.view
  )
  writeDefaultedParam(
    params,
    'density',
    filters.density,
    DEFAULT_LIBRARY_FILTER_PARAMS.density
  )
}

const createLibraryFilterSearchParams = (
  current: URLSearchParams,
  patch: Partial<LibraryFilterParams>
): URLSearchParams =>
  createPatchedSearchParams(
    current,
    patch,
    parseLibraryFilterParams,
    writeLibraryFilterParams
  )

interface LibraryFilters
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

// search updates replace history so each keystroke doesn't push a back entry
const LIBRARY_SETTER_OPTIONS = {
  search: { replace: true },
  filter: undefined,
  sort: undefined,
  view: undefined,
  density: undefined,
} as const

export const useLibraryFilters = (): LibraryFilters =>
{
  const { filters, searchDebounced, commitFilters } = useUrlFilterParams({
    debounceMs: SEARCH_DEBOUNCE_MS,
    parse: parseLibraryFilterParams,
    create: createLibraryFilterSearchParams,
  })

  const setters = useFilterSetters(commitFilters, LIBRARY_SETTER_OPTIONS)

  return {
    searchInput: filters.search,
    searchDebounced,
    filter: filters.filter,
    sort: filters.sort,
    view: filters.view,
    density: filters.density,
    setSearch: setters.search,
    setFilter: setters.filter,
    setSort: setters.sort,
    setView: setters.view,
    setDensity: setters.density,
  }
}
