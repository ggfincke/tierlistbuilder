// src/features/library/pages/MyBoardsPage.tsx
// my-boards library landing — editorial hero, filter rail, & board grid/table

import { useDeferredValue, useMemo } from 'react'

import type { LibraryBoardFilter } from '@tierlistbuilder/contracts/workspace/board'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'

import { BoardCard } from '~/features/library/components/BoardCard'
import { BoardListTable } from '~/features/library/components/BoardListTable'
import { LibraryEmptyState } from '~/features/library/components/LibraryEmptyState'
import { LibraryFilterBar } from '~/features/library/components/LibraryFilterBar'
import { LibrarySearchInput } from '~/features/library/components/LibrarySearchInput'
import { LibrarySignedOutState } from '~/features/library/components/LibrarySignedOutState'
import { LibrarySkeleton } from '~/features/library/components/LibrarySkeleton'
import { NewListTile } from '~/features/library/components/NewListTile'
import { getLibraryFilterStatusLabel } from '~/features/library/lib/statusMeta'
import {
  countLibraryPublishStates,
  filterLibraryBoards,
  sortLibraryBoards,
} from '~/features/library/lib/sortAndFilter'
import { useBoardsLibrary } from '~/features/library/model/useBoardsLibrary'
import { useCreateLibraryBoard } from '~/features/library/model/useCreateLibraryBoard'
import { useLibraryFilters } from '~/features/library/model/useLibraryFilters'
import { useLocalBoardsLibrary } from '~/features/library/model/useLocalBoardsLibrary'
import { useOpenLibraryBoard } from '~/features/library/model/useOpenLibraryBoard'
import { useOpenLocalBoard } from '~/features/library/model/useOpenLocalBoard'
import { LivePulse } from '~/shared/ui/LivePulse'
import { useDocumentTitle } from '~/shared/hooks/useDocumentTitle'
import { foldForSearch } from '~/shared/lib/text'

// columns per density for the grid view. dense packs 4 across, default 3,
// loose 2 — large covers feel hero-ish at 2-up
const COLUMNS_BY_DENSITY = { dense: 4, default: 3, loose: 2 } as const

// contextual section title per active filter
const SECTION_HEADING: Record<LibraryBoardFilter, string> = {
  all: 'All boards',
  draft: 'Drafts',
  wip: 'In progress',
  live: 'Live boards',
}

interface HeroStatProps
{
  label: string
  value: number
}

const HeroStat = ({ label, value }: HeroStatProps) => (
  <div className="flex items-baseline justify-between gap-2">
    <dt className="text-[var(--t-text-faint)]">{label}</dt>
    <dd className="tabular-nums text-[var(--t-text)]">{value}</dd>
  </div>
)

export const MyBoardsPage = () =>
{
  const session = useAuthSession()
  const isSignedIn = session.status === 'signed-in'
  const isAuthLoading = session.status === 'loading'

  // signed-in reads the cloud subscription; signed-out projects locally-
  // persisted boards so they're visible instead of hidden behind an auth wall
  const cloudLibrary = useBoardsLibrary(isSignedIn)
  const localLibrary = useLocalBoardsLibrary(!isSignedIn && !isAuthLoading)
  const { rows, isLoading } = isSignedIn ? cloudLibrary : localLibrary

  const filters = useLibraryFilters()
  const openCloudBoard = useOpenLibraryBoard()
  const openLocalBoard = useOpenLocalBoard()
  const { open: openBoard, pendingBoardExternalId } = isSignedIn
    ? openCloudBoard
    : openLocalBoard
  const createBoard = useCreateLibraryBoard()
  const deferredSearch = useDeferredValue(filters.searchDebounced)
  const deferredFilter = useDeferredValue(filters.filter)
  const deferredSort = useDeferredValue(filters.sort)
  useDocumentTitle('My boards · TierListBuilder')

  const counts = useMemo(() => countLibraryPublishStates(rows ?? []), [rows])

  // precompute normalized titles once per row identity so the per-keystroke
  // filter doesn't re-fold every haystack across every render
  const foldedTitleByExternalId = useMemo(() =>
  {
    const map = new Map<string, string>()
    if (!rows) return map
    for (const row of rows)
    {
      map.set(row.externalId, foldForSearch(row.title))
    }
    return map
  }, [rows])

  const visibleBoards = useMemo(() =>
  {
    if (!rows) return null
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

  const showSignedOutBanner = !isAuthLoading && !isSignedIn
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
  const deferredFilterLabel = getLibraryFilterStatusLabel(deferredFilter)

  const handleClearFilter = () =>
  {
    filters.setFilter('all')
    filters.setSearch('')
  }

  return (
    <section className="relative z-10 mx-auto w-full max-w-[1320px] px-6 pt-20 pb-24 sm:px-10 sm:pt-24">
      {/* editorial hero — eyebrow + wordmark left, search + mono stats right */}
      <div className="flex flex-wrap items-end justify-between gap-8 border-b border-[var(--t-border)] pb-6">
        <div className="min-w-0 max-w-2xl">
          <p
            className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--t-text-muted)]"
            style={{ fontFamily: 'var(--ts-mono)' }}
          >
            <span>Your shelf</span>
            <span aria-hidden>·</span>
            <span>{totalLoadedBoards} on file</span>
            {counts.live > 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1.5 text-[var(--t-accent)]">
                  <LivePulse size={6} srLabel="" />
                  {counts.live} live
                </span>
              </>
            )}
          </p>
          <h1
            className="mt-3 font-black leading-[0.96] tracking-[-0.04em] text-[var(--t-text)]"
            style={{ fontSize: 'clamp(3rem, 6vw, 5rem)' }}
          >
            My <span className="text-[var(--t-accent)]">boards.</span>
          </h1>
          <p className="mt-3 max-w-md text-[14px] leading-relaxed text-[var(--t-text-muted)]">
            Drafts, rankings in flight, and finished boards — everything you've
            made, organized like a record collection.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-[280px]">
          <LibrarySearchInput
            value={filters.searchInput}
            onChange={filters.setSearch}
          />
          <dl
            className="grid grid-cols-2 gap-x-5 gap-y-1.5 text-[10px] uppercase tracking-[0.16em]"
            style={{ fontFamily: 'var(--ts-mono)' }}
          >
            <HeroStat label="Filed" value={counts.all} />
            <HeroStat label="WIP" value={counts.wip} />
            <HeroStat label="Live" value={counts.live} />
            <HeroStat label="Drafts" value={counts.draft} />
          </dl>
        </div>
      </div>

      {showSignedOutBanner && (
        <div className="mt-5">
          <LibrarySignedOutState />
        </div>
      )}

      {/* filter / sort / view / density rail */}
      <div className="mt-7">
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

      {/* section head — contextual title + mono result meta */}
      <div className="mb-3.5 mt-9 flex items-end justify-between gap-3 border-b border-[var(--t-border)] pb-2">
        <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-[var(--t-text)]">
          {SECTION_HEADING[deferredFilter]}
        </h2>
        <span
          className="shrink-0 text-[10px] uppercase tracking-[0.16em] text-[var(--t-text-faint)]"
          style={{ fontFamily: 'var(--ts-mono)' }}
        >
          {showSkeleton
            ? 'Loading…'
            : `${totalVisible} on view${
                filtersActive && deferredFilterLabel
                  ? ` · ${deferredFilterLabel.toLowerCase()}`
                  : ''
              }`}
        </span>
      </div>

      {/* content */}
      <div
        className={`transition-opacity ${resultsPending ? 'opacity-70' : ''}`}
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
          <LibraryEmptyState
            mode={totalLoadedBoards !== 0 ? 'filtered' : 'first-time'}
            onClearFilter={
              totalLoadedBoards !== 0 ? handleClearFilter : undefined
            }
            onCreate={createBoard.create}
            createPending={createBoard.isPending}
          />
        ) : filters.view === 'list' ? (
          <BoardListTable
            boards={visibleBoards ?? []}
            onOpenBoard={openBoard}
            pendingBoardExternalId={pendingBoardExternalId}
          />
        ) : (
          <div className="grid gap-3.5" style={gridStyle}>
            {!filtersActive && (
              <NewListTile
                onCreate={createBoard.create}
                isPending={createBoard.isPending}
              />
            )}
            {(visibleBoards ?? []).map((board) => (
              <div key={board.externalId} className="h-full min-w-0">
                <BoardCard
                  board={board}
                  density={filters.density}
                  onOpen={openBoard}
                  isPending={pendingBoardExternalId === board.externalId}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
