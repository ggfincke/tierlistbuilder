// src/features/library/pages/MyBoardsPage.tsx
// my-boards library landing — editorial hero, filter rail, & board grid/table

import { useDeferredValue, useMemo } from 'react'

import type { LibraryBoardFilter } from '@tierlistbuilder/contracts/workspace/board'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'

import { BoardCard } from '~/features/library/ui/cards/BoardCard'
import { BoardListTable } from '~/features/library/ui/list/BoardListTable'
import { LibraryEmptyState } from '~/features/library/ui/chrome/LibraryEmptyState'
import { LibraryFilterBar } from '~/features/library/ui/chrome/LibraryFilterBar'
import { LibrarySearchInput } from '~/features/library/ui/chrome/LibrarySearchInput'
import { LibrarySignedOutState } from '~/features/library/ui/chrome/LibrarySignedOutState'
import { LibrarySkeleton } from '~/features/library/ui/chrome/LibrarySkeleton'
import { NewBoardTile } from '~/features/library/ui/cards/NewBoardTile'
import { getLibraryFilterStatusLabel } from '~/features/library/lib/statusMeta'
import {
  LIBRARY_GRID_CLASS_BY_DENSITY,
  LIBRARY_GRID_COLUMNS_BY_DENSITY,
} from '~/features/library/lib/densityLayout'
import {
  countLibraryPublishStates,
  filterLibraryBoards,
  sortLibraryBoards,
} from '~/features/library/lib/sortAndFilter'
import { RenameBoardModal } from '~/features/library/ui/modals/RenameBoardModal'
import { useBoardsLibrary } from '~/features/library/model/useBoardsLibrary'
import { useStartBlankBoard } from '~/features/workspace/boards/model/useStartBlankBoard'
import { useDeleteLibraryBoard } from '~/features/library/model/useDeleteLibraryBoard'
import { useDuplicateLibraryBoard } from '~/features/library/model/useDuplicateLibraryBoard'
import { useLibraryFilters } from '~/features/library/model/useLibraryFilters'
import { useLocalBoardsLibrary } from '~/features/library/model/useLocalBoardsLibrary'
import { useOpenBoard } from '~/features/library/model/useOpenBoard'
import { useRenameLibraryBoard } from '~/features/library/model/useRenameLibraryBoard'
import { ConfirmDialog } from '~/shared/overlay/ConfirmDialog'
import { LivePulse } from '~/shared/ui/LivePulse'
import { DisplayHeadline } from '~/shared/ui/DisplayHeadline'
import { PAGE_SHELL } from '~/shared/ui/pageContainer'
import { useDocumentTitle } from '~/shared/hooks/useDocumentTitle'
import { foldForSearch } from '~/shared/lib/text'

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
  const { open: openBoard, pendingBoardExternalId } = useOpenBoard(isSignedIn)
  const createBoard = useStartBlankBoard({ withToast: true })
  const deleteBoard = useDeleteLibraryBoard()
  const duplicateBoard = useDuplicateLibraryBoard()
  const renameBoard = useRenameLibraryBoard()
  // any in-flight library mutation lights up a card's pending UI so the user
  // can't fire a second action against the same row while one is running
  const pendingActionExternalId =
    deleteBoard.pendingExternalId ??
    duplicateBoard.pendingExternalId ??
    renameBoard.pendingExternalId
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
    <section className={`${PAGE_SHELL} pt-20 pb-24 sm:pt-24`}>
      {/* editorial hero — eyebrow + wordmark left, search + mono stats right */}
      <div className="flex flex-wrap items-end justify-between gap-8 border-b border-[var(--t-border)] pb-6">
        <DisplayHeadline
          eyebrow={
            <span className="flex flex-wrap items-center gap-2">
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
            </span>
          }
          accent="My boards"
          subtitle="Drafts, rankings in flight, and finished boards — everything you've made, organized like a record collection."
          size="display"
          maxWidthClassName="max-w-2xl"
        />

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
        <DisplayHeadline
          primary={SECTION_HEADING[deferredFilter]}
          size="section"
          as="h2"
        />
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
                : LIBRARY_GRID_COLUMNS_BY_DENSITY[filters.density] * 2
            }
          />
        ) : showEmptyState ? (
          <LibraryEmptyState
            mode={totalLoadedBoards !== 0 ? 'filtered' : 'first-time'}
            onClearFilter={
              totalLoadedBoards !== 0 ? handleClearFilter : undefined
            }
            onCreate={createBoard.start}
            createPending={createBoard.isPending}
          />
        ) : filters.view === 'list' ? (
          <BoardListTable
            boards={visibleBoards ?? []}
            onOpenBoard={openBoard}
            onRequestDelete={deleteBoard.requestDelete}
            onRequestRename={renameBoard.requestRename}
            onDuplicate={duplicateBoard.duplicate}
            pendingBoardExternalId={pendingBoardExternalId}
            pendingActionExternalId={pendingActionExternalId}
          />
        ) : (
          <div
            className={`grid gap-5 ${LIBRARY_GRID_CLASS_BY_DENSITY[filters.density]}`}
          >
            {!filtersActive && (
              <NewBoardTile
                onCreate={createBoard.start}
                isPending={createBoard.isPending}
              />
            )}
            {(visibleBoards ?? []).map((board) => (
              <div key={board.externalId} className="h-full min-w-0">
                <BoardCard
                  board={board}
                  density={filters.density}
                  onOpen={openBoard}
                  onRequestDelete={deleteBoard.requestDelete}
                  onRequestRename={renameBoard.requestRename}
                  onDuplicate={duplicateBoard.duplicate}
                  isPending={
                    pendingBoardExternalId === board.externalId ||
                    pendingActionExternalId === board.externalId
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {deleteBoard.confirmTarget && (
        <ConfirmDialog
          open
          title="Delete board?"
          description={
            deleteBoard.confirmTarget.syncState === 'localOnly'
              ? `"${deleteBoard.confirmTarget.title}" will be permanently deleted.`
              : `"${deleteBoard.confirmTarget.title}" will be moved to Recently deleted. You can restore it for 30 days.`
          }
          confirmText="Delete"
          onCancel={deleteBoard.cancelDelete}
          onConfirm={() =>
          {
            void deleteBoard.confirmDelete()
          }}
        />
      )}

      <RenameBoardModal
        // remount on target change so the input re-initializes to the new
        // title without a useEffect chasing the prop
        key={renameBoard.renameTarget?.externalId ?? 'closed'}
        open={renameBoard.renameTarget !== null}
        currentTitle={renameBoard.renameTarget?.currentTitle ?? ''}
        onCancel={renameBoard.cancelRename}
        onSubmit={(nextTitle) =>
        {
          void renameBoard.confirmRename(nextTitle)
        }}
      />
    </section>
  )
}
