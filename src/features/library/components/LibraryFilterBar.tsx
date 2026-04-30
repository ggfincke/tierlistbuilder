// src/features/library/components/LibraryFilterBar.tsx
// horizontal control row — filter chips, sort menu, view & density toggles

import { ArrowUpDown, LayoutGrid, Rows3 } from 'lucide-react'

import {
  LIBRARY_BOARD_FILTERS,
  LIBRARY_BOARD_SORTS,
  LIBRARY_BOARD_VIEWS,
  type LibraryBoardDensity,
  type LibraryBoardFilter,
  type LibraryBoardSort,
  type LibraryBoardView,
} from '@tierlistbuilder/contracts/workspace/board'

import type { LibraryStatusCounts } from '~/features/library/lib/sortAndFilter'
import { DensityToggle } from './DensityToggle'

interface LibraryFilterBarProps
{
  filter: LibraryBoardFilter
  onFilterChange: (next: LibraryBoardFilter) => void
  sort: LibraryBoardSort
  onSortChange: (next: LibraryBoardSort) => void
  view: LibraryBoardView
  onViewChange: (next: LibraryBoardView) => void
  // density is grid-only; toggle hides itself in list view
  density: LibraryBoardDensity
  onDensityChange: (next: LibraryBoardDensity) => void
  counts: LibraryStatusCounts
}

const FILTER_LABELS: Record<LibraryBoardFilter, string> = {
  all: 'All',
  draft: 'Drafts',
  in_progress: 'In progress',
  finished: 'Finished',
  published: 'Published',
}

const SORT_LABELS: Record<LibraryBoardSort, string> = {
  updated: 'Last updated',
  created: 'Date created',
  title: 'Title (A–Z)',
  progress: 'Most progress',
}

const VIEW_META: Record<
  LibraryBoardView,
  { label: string; Icon: typeof LayoutGrid }
> = {
  grid: { label: 'Grid view', Icon: LayoutGrid },
  list: { label: 'List view', Icon: Rows3 },
}

export const LibraryFilterBar = ({
  filter,
  onFilterChange,
  sort,
  onSortChange,
  view,
  onViewChange,
  density,
  onDensityChange,
  counts,
}: LibraryFilterBarProps) =>
{
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div
        className="flex flex-1 items-center gap-2 overflow-x-auto pb-1"
        style={{ scrollbarWidth: 'thin' }}
      >
        {LIBRARY_BOARD_FILTERS.map((id) =>
        {
          const active = filter === id
          const count = counts[id]
          return (
            <button
              key={id}
              type="button"
              onClick={() => onFilterChange(id)}
              aria-pressed={active}
              className={
                active
                  ? 'focus-custom inline-flex shrink-0 items-center gap-1.5 rounded-full border border-transparent bg-[var(--t-text)] px-3 py-1.5 text-[12px] font-medium text-[var(--t-bg-page)] transition focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]'
                  : 'focus-custom inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--t-border)] bg-[rgb(var(--t-overlay)/0.04)] px-3 py-1.5 text-[12px] font-medium text-[var(--t-text-secondary)] transition hover:border-[var(--t-border-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]'
              }
            >
              {FILTER_LABELS[id]}
              <span className="tabular-nums opacity-60">{count}</span>
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        <label className="focus-custom inline-flex items-center gap-1.5 rounded-full border border-[var(--t-border)] bg-[rgb(var(--t-overlay)/0.04)] px-3 py-1.5 text-[12px] font-medium text-[var(--t-text-secondary)] transition focus-within:ring-2 focus-within:ring-[var(--t-accent)] hover:border-[var(--t-border-hover)] hover:text-[var(--t-text)]">
          <ArrowUpDown className="h-3 w-3" strokeWidth={1.8} aria-hidden />
          <span className="sr-only">Sort lists by</span>
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as LibraryBoardSort)}
            className="focus-custom bg-transparent text-[12px] font-medium text-[var(--t-text)] outline-none"
          >
            {LIBRARY_BOARD_SORTS.map((id) => (
              <option key={id} value={id}>
                {SORT_LABELS[id]}
              </option>
            ))}
          </select>
        </label>

        {view === 'grid' && (
          <DensityToggle density={density} onChange={onDensityChange} />
        )}

        <div
          className="flex items-center gap-0.5 rounded-full border border-[var(--t-border)] bg-[rgb(var(--t-overlay)/0.04)] p-1"
          role="radiogroup"
          aria-label="Choose layout"
        >
          {LIBRARY_BOARD_VIEWS.map((id) =>
          {
            const active = view === id
            const { label, Icon } = VIEW_META[id]
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={label}
                title={label}
                onClick={() => onViewChange(id)}
                className={
                  active
                    ? 'focus-custom flex h-7 w-7 items-center justify-center rounded-full bg-[var(--t-text)] text-[var(--t-bg-page)] transition focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]'
                    : 'focus-custom flex h-7 w-7 items-center justify-center rounded-full text-[var(--t-text-muted)] transition hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]'
                }
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
