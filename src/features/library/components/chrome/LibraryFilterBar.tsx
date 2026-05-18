// src/features/library/components/chrome/LibraryFilterBar.tsx
// horizontal control rail — publish-state filter chips, sort menu, view &
// density toggles. The chip rail shares the Scoreboard +New CTA register

import { ArrowUpDown, LayoutGrid, Rows3 } from 'lucide-react'

import {
  LIBRARY_BOARD_SORTS,
  LIBRARY_BOARD_VIEWS,
  type LibraryBoardDensity,
  type LibraryBoardFilter,
  type LibraryBoardSort,
  type LibraryBoardView,
} from '@tierlistbuilder/contracts/workspace/board'

import {
  VISIBLE_LIBRARY_BOARD_FILTERS,
  type LibraryPublishCounts,
} from '~/features/library/lib/sortAndFilter'
import { PUBLISH_STATE_META } from '~/shared/board-ui/publishStateMeta'
import {
  IconToggleGroup,
  type IconToggleOption,
} from '~/shared/ui/IconToggleGroup'
import { createTypedSelectChangeHandler } from '~/shared/ui/selectChange'
import { Chip } from '~/shared/ui/Chip'
import { DensityToggle } from '~/features/library/components/chrome/DensityToggle'

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
  counts: LibraryPublishCounts
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

const VIEW_OPTIONS: IconToggleOption<LibraryBoardView>[] =
  LIBRARY_BOARD_VIEWS.map((value) => ({
    value,
    ...VIEW_META[value],
  }))

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
  const handleSortChange = createTypedSelectChangeHandler(
    LIBRARY_BOARD_SORTS,
    onSortChange
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip
        label="All"
        count={counts.all}
        active={filter === 'all'}
        onClick={() => onFilterChange('all')}
      />
      {VISIBLE_LIBRARY_BOARD_FILTERS.map((id) => (
        <Chip
          key={id}
          label={PUBLISH_STATE_META[id].label}
          count={counts[id]}
          active={filter === id}
          onClick={() => onFilterChange(id)}
        />
      ))}

      <div className="flex-1" />

      <label className="focus-custom inline-flex items-center gap-1.5 rounded-md border border-[var(--t-border)] px-3 py-1.5 text-xs font-medium text-[var(--t-text-muted)] transition focus-within:ring-2 focus-within:ring-[var(--t-accent)] hover:border-[var(--t-border-secondary)] hover:text-[var(--t-text)]">
        <ArrowUpDown className="h-3 w-3" strokeWidth={1.8} aria-hidden />
        <span className="sr-only">Sort boards by</span>
        <select
          value={sort}
          onChange={handleSortChange}
          className="focus-custom bg-transparent text-xs font-medium text-[var(--t-text)] outline-none"
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

      <IconToggleGroup
        value={view}
        options={VIEW_OPTIONS}
        onChange={onViewChange}
        ariaLabel="Choose layout"
      />
    </div>
  )
}
