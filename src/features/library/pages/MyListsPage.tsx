// src/features/library/pages/MyListsPage.tsx
// my-lists library landing — heading, stats strip, filter bar, grid or table

import { Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useDeferredValue, useEffect, useMemo } from 'react'

import type { LibraryBoardStatus } from '@tierlistbuilder/contracts/workspace/board'
import { TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'

import { BoardCard } from '~/features/library/components/BoardCard'
import { BoardListTable } from '~/features/library/components/BoardListTable'
import { LibraryEmptyState } from '~/features/library/components/LibraryEmptyState'
import { LibraryFilterBar } from '~/features/library/components/LibraryFilterBar'
import { LibrarySearchInput } from '~/features/library/components/LibrarySearchInput'
import { NewListTile } from '~/features/library/components/NewListTile'
import { StatsStrip } from '~/features/library/components/StatsStrip'
import { LIBRARY_STATUS_META } from '~/features/library/lib/statusMeta'
import {
  countLibraryStatuses,
  filterLibraryBoards,
  sortLibraryBoards,
} from '~/features/library/lib/sortAndFilter'
import { useBoardsLibrary } from '~/features/library/model/useBoardsLibrary'
import { useLibraryFilters } from '~/features/library/model/useLibraryFilters'
import { useOpenLibraryBoard } from '~/features/library/model/useOpenLibraryBoard'

const COLUMNS_BY_DENSITY = { dense: 4, default: 3, loose: 2 } as const

// fold case + diacritics so "Pokemon" matches "Pokémon". no fuzzy ranking yet;
// substring match is sufficient at the current scale
const foldForSearch = (raw: string): string =>
  raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export const MyListsPage = () =>
{
  const { rows } = useBoardsLibrary()

  const filters = useLibraryFilters()
  const openBoard = useOpenLibraryBoard()
  const deferredSearch = useDeferredValue(filters.searchDebounced)
  const deferredFilter = useDeferredValue(filters.filter)
  const deferredSort = useDeferredValue(filters.sort)

  const counts = useMemo(() => countLibraryStatuses(rows), [rows])

  // precompute normalized titles once per row identity so the per-keystroke
  // filter doesn't re-fold every haystack across every render
  const foldedTitleByExternalId = useMemo(() =>
  {
    const map = new Map<string, string>()
    for (const row of rows)
    {
      map.set(row.externalId, foldForSearch(row.title))
    }
    return map
  }, [rows])

  const visibleBoards = useMemo(() =>
  {
    const needle = foldForSearch(deferredSearch.trim())
    const filtered = filterLibraryBoards(rows, deferredFilter)
    const searched = needle
      ? filtered.filter((board) =>
          (foldedTitleByExternalId.get(board.externalId) ?? '').includes(needle)
        )
      : filtered
    return sortLibraryBoards(searched, deferredSort)
  }, [
    rows,
    deferredFilter,
    deferredSort,
    deferredSearch,
    foldedTitleByExternalId,
  ])

  const gridStyle = useMemo(
    () => ({
      gridTemplateColumns: `repeat(${COLUMNS_BY_DENSITY[filters.density]}, minmax(0, 1fr))`,
    }),
    [filters.density]
  )

  useEffect(() =>
  {
    const previous = document.title
    document.title = 'My lists · TierListBuilder'
    return () =>
    {
      document.title = previous
    }
  }, [])

  const filtersActive =
    deferredFilter !== 'all' || deferredSearch.trim().length > 0
  const resultsPending =
    filters.searchDebounced !== deferredSearch ||
    filters.filter !== deferredFilter ||
    filters.sort !== deferredSort
  const totalLoadedBoards = rows.length
  const totalVisible = visibleBoards.length
  const showEmptyState = totalVisible === 0

  const handleClearFilter = () =>
  {
    filters.setFilter('all')
    filters.setSearch('')
  }

  return (
    <section className="relative z-10 mx-auto w-full max-w-[1280px] px-6 pt-20 pb-12 sm:px-10 sm:pt-24">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--t-text-faint)]">
            Your library
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-[var(--t-text)] sm:text-5xl">
            My lists
          </h1>
          <p className="mt-2 max-w-lg text-[14px] text-[var(--t-text-muted)]">
            Drafts, rankings in flight, and finished lists you've kept or
            shared.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LibrarySearchInput
            value={filters.searchInput}
            onChange={filters.setSearch}
          />
          <Link
            to={TEMPLATES_ROUTE_PATH}
            className="focus-custom inline-flex items-center gap-1.5 rounded-full bg-[var(--t-text)] px-4 py-2 text-[12px] font-semibold text-[var(--t-bg-page)] transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
            New list
          </Link>
        </div>
      </div>

      <div className="mt-8">
        <StatsStrip counts={counts} totalBoards={rows.length} />
      </div>

      <div className="mt-8">
        <LibraryFilterBar
          filter={filters.filter}
          onFilterChange={filters.setFilter}
          sort={filters.sort}
          onSortChange={filters.setSort}
          view={filters.view}
          onViewChange={filters.setView}
          density={filters.density}
          onDensityChange={filters.setDensity}
          counts={counts}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-[var(--t-text-muted)]">
          <span className="tabular-nums text-[var(--t-text-secondary)]">
            {totalVisible}
          </span>{' '}
          {totalVisible === 1 ? 'list' : 'lists'}
          {filtersActive && (
            <>
              {' · filtered'}
              {deferredFilter !== 'all' && (
                <>
                  {' by '}
                  <span className="text-[var(--t-text-secondary)]">
                    {LIBRARY_STATUS_META[
                      deferredFilter as LibraryBoardStatus
                    ].label.toLowerCase()}
                  </span>
                </>
              )}
              {deferredSearch.trim() && (
                <>
                  {' · matching "'}
                  <span className="text-[var(--t-text-secondary)]">
                    {deferredSearch.trim()}
                  </span>
                  "
                </>
              )}
            </>
          )}
        </p>
      </div>

      <div
        className={`mt-4 transition-opacity ${resultsPending ? 'opacity-70' : ''}`}
        aria-busy={resultsPending || undefined}
      >
        {renderLibraryContent({
          showEmptyState,
          totalLoadedBoards,
          handleClearFilter,
          view: filters.view,
          density: filters.density,
          gridStyle,
          visibleBoards,
          filtersActive,
          openBoard,
        })}
      </div>
    </section>
  )
}

interface LibraryContentArgs
{
  showEmptyState: boolean
  totalLoadedBoards: number
  handleClearFilter: () => void
  view: ReturnType<typeof useLibraryFilters>['view']
  density: ReturnType<typeof useLibraryFilters>['density']
  gridStyle: { gridTemplateColumns: string }
  visibleBoards: ReturnType<typeof sortLibraryBoards>
  filtersActive: boolean
  openBoard: ReturnType<typeof useOpenLibraryBoard>
}

const renderLibraryContent = ({
  showEmptyState,
  totalLoadedBoards,
  handleClearFilter,
  view,
  density,
  gridStyle,
  visibleBoards,
  filtersActive,
  openBoard,
}: LibraryContentArgs) =>
{
  if (showEmptyState)
  {
    return totalLoadedBoards === 0 ? (
      <LibraryEmptyState filtered={false} />
    ) : (
      <LibraryEmptyState filtered onClearFilter={handleClearFilter} />
    )
  }
  if (view === 'list')
  {
    return (
      <BoardListTable
        boards={visibleBoards}
        onOpenBoard={openBoard.open}
        pendingBoardExternalId={openBoard.pendingBoardExternalId}
      />
    )
  }
  return (
    <div className="grid gap-5" style={gridStyle}>
      {!filtersActive && <NewListTile />}
      {visibleBoards.map((board) => (
        <BoardCard
          key={board.externalId}
          board={board}
          density={density}
          onOpen={openBoard.open}
          isPending={openBoard.pendingBoardExternalId === board.externalId}
        />
      ))}
    </div>
  )
}
