// src/features/library/pages/MyListsPage.tsx
// my-lists library landing — heading, stats strip, filter bar, grid or table

import { Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useDeferredValue, useEffect, useMemo, type CSSProperties } from 'react'

import type {
  LibraryBoardDensity,
  LibraryBoardListItem,
  LibraryBoardStatus,
} from '@tierlistbuilder/contracts/workspace/board'
import { TEMPLATES_ROUTE_PATH } from '~/app/routes/pathname'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { getDisplayName } from '~/features/platform/auth/model/userIdentity'

import { BoardCard } from '~/features/library/components/BoardCard'
import { BoardListTable } from '~/features/library/components/BoardListTable'
import { LibraryEmptyState } from '~/features/library/components/LibraryEmptyState'
import { LibraryFilterBar } from '~/features/library/components/LibraryFilterBar'
import { LibrarySearchInput } from '~/features/library/components/LibrarySearchInput'
import { LibrarySignedOutState } from '~/features/library/components/LibrarySignedOutState'
import { LibrarySkeleton } from '~/features/library/components/LibrarySkeleton'
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

// columns per density for the grid view. dense packs 4 across, default 3,
// loose 2 — large covers feel hero-ish at 2-up
const COLUMNS_BY_DENSITY = { dense: 4, default: 3, loose: 2 } as const
const GRID_INTRINSIC_HEIGHT_BY_DENSITY = {
  dense: '205px',
  default: '260px',
  loose: '330px',
} as const satisfies Record<LibraryBoardDensity, string>

type DeferredGridStyle = CSSProperties & {
  '--deferred-grid-item-height': string
}

// fold normalized title against a normalized search term — case + diacritics
// folded so "Pokemon" matches "Pokémon". no fuzzy ranking yet; the v1 list
// tops out at 200 boards so substring match is sufficient
const matchesSearch = (
  board: LibraryBoardListItem,
  needle: string
): boolean =>
{
  if (!needle) return true
  const haystack = board.title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
  return haystack.includes(needle)
}

export const MyListsPage = () =>
{
  const session = useAuthSession()
  const isSignedIn = session.status === 'signed-in'
  const isAuthLoading = session.status === 'loading'

  // boards subscription — paused while signed-out so the websocket isn't
  // burning a query for an answer we already know is []
  const { rows, isLoading } = useBoardsLibrary(isSignedIn)

  const filters = useLibraryFilters()
  const openBoard = useOpenLibraryBoard()
  const deferredSearch = useDeferredValue(filters.searchDebounced)
  const deferredFilter = useDeferredValue(filters.filter)
  const deferredSort = useDeferredValue(filters.sort)

  const counts = useMemo(() => countLibraryStatuses(rows ?? []), [rows])

  const visibleBoards = useMemo(() =>
  {
    if (!rows) return null
    const needle = deferredSearch
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim()
      .toLowerCase()
    const filtered = filterLibraryBoards(rows, deferredFilter)
    const searched = needle
      ? filtered.filter((board) => matchesSearch(board, needle))
      : filtered
    return sortLibraryBoards(searched, deferredSort)
  }, [rows, deferredFilter, deferredSort, deferredSearch])

  const gridStyle = useMemo<DeferredGridStyle>(
    () => ({
      gridTemplateColumns: `repeat(${COLUMNS_BY_DENSITY[filters.density]}, minmax(0, 1fr))`,
      '--deferred-grid-item-height':
        GRID_INTRINSIC_HEIGHT_BY_DENSITY[filters.density],
    }),
    [filters.density]
  )

  // document title for tab clarity & deep-link share previews
  useEffect(() =>
  {
    const previous = document.title
    document.title = 'My lists · TierListBuilder'
    return () =>
    {
      document.title = previous
    }
  }, [])

  // signed-out — bail to the marketing-style surface
  if (!isAuthLoading && !isSignedIn)
  {
    return <LibrarySignedOutState />
  }

  const eyebrow =
    session.status === 'signed-in'
      ? `Your library · ${getDisplayName(session.user, '', { email: 'local' })}`
      : 'Your library'

  const filtersActive =
    deferredFilter !== 'all' || deferredSearch.trim().length > 0
  const resultsPending =
    filters.searchDebounced !== deferredSearch ||
    filters.filter !== deferredFilter ||
    filters.sort !== deferredSort
  const totalLoadedBoards = rows?.length ?? 0
  const totalVisible = visibleBoards?.length ?? 0
  const showEmptyState = !isLoading && rows !== null && totalVisible === 0
  const showSkeleton = isLoading || rows === null

  const handleClearFilter = () =>
  {
    filters.setFilter('all')
    filters.setSearch('')
  }

  return (
    <section className="relative z-10 mx-auto w-full max-w-[1280px] px-6 pt-20 pb-12 sm:px-10 sm:pt-24">
      {/* page header */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--t-text-faint)]">
            {eyebrow}
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

      {/* stats — only render once the rows have arrived so the numbers don't
          flash zero before populating */}
      {rows && (
        <div className="mt-8">
          <StatsStrip boards={rows} />
        </div>
      )}

      {/* filter / sort / view / density */}
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

      {/* result count line */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-[var(--t-text-muted)]">
          {showSkeleton ? (
            <span className="text-[var(--t-text-faint)]">Loading…</span>
          ) : (
            <>
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
            </>
          )}
        </p>
      </div>

      {/* content */}
      <div
        className={`mt-4 transition-opacity ${resultsPending ? 'opacity-70' : ''}`}
        aria-busy={resultsPending || undefined}
      >
        {showSkeleton ? (
          <LibrarySkeleton
            density={filters.density}
            layout={filters.view}
            count={
              filters.view === 'list'
                ? 6
                : COLUMNS_BY_DENSITY[filters.density] * 2
            }
          />
        ) : showEmptyState ? (
          totalLoadedBoards === 0 ? (
            <LibraryEmptyState filtered={false} />
          ) : (
            <LibraryEmptyState filtered onClearFilter={handleClearFilter} />
          )
        ) : filters.view === 'list' ? (
          <BoardListTable
            boards={visibleBoards ?? []}
            onOpenBoard={(board) => void openBoard.open(board)}
            pendingBoardExternalId={openBoard.pendingBoardExternalId}
          />
        ) : (
          <div className="grid gap-5" style={gridStyle}>
            {!filtersActive && <NewListTile />}
            {(visibleBoards ?? []).map((board) => (
              <div
                key={board.externalId}
                className="deferred-grid-item h-full min-w-0"
              >
                <BoardCard
                  board={board}
                  density={filters.density}
                  onOpen={(b) => void openBoard.open(b)}
                  isPending={
                    openBoard.pendingBoardExternalId === board.externalId
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
