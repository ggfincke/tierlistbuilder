// src/features/marketplace/components/consensus/criterion/ConsensusToolbar.tsx
// single-row toolbar [search][sort][viz icons]. search & sort drive server
// queries; viz toggles in-section

import {
  Activity,
  BarChart3,
  Grid3x3,
  ListOrdered,
  Rows3,
  Search,
  SortAsc,
  X,
  type LucideIcon,
} from 'lucide-react'

import {
  TEMPLATE_RANKING_AGGREGATE_ITEM_SORTS,
  type TemplateRankingAggregateItemSort,
} from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import { createTypedSelectChangeHandler } from '~/shared/ui/selectChange'

import { SORT_LABELS, type ConsensusVizMode } from '../lib/utils'

interface ConsensusToolbarProps
{
  query: string
  onQueryChange: (next: string) => void
  sort: TemplateRankingAggregateItemSort
  onSortChange: (next: TemplateRankingAggregateItemSort) => void
  vizMode: ConsensusVizMode
  onVizModeChange: (next: ConsensusVizMode) => void
  totalCount: number
  filteredCount: number
}

interface VizConfig
{
  value: ConsensusVizMode
  Icon: LucideIcon
  label: string
}

const VIZ_CONFIG: VizConfig[] = [
  { value: 'tiers', Icon: Rows3, label: 'Tier rows' },
  { value: 'bars', Icon: BarChart3, label: 'Bars' },
  { value: 'heatmap', Icon: Grid3x3, label: 'Heatmap' },
  { value: 'scatter', Icon: Activity, label: 'Scatter' },
  { value: 'ranked', Icon: ListOrdered, label: 'Ranked' },
]

export const ConsensusToolbar = ({
  query,
  onQueryChange,
  sort,
  onSortChange,
  vizMode,
  onVizModeChange,
  totalCount,
  filteredCount,
}: ConsensusToolbarProps) =>
{
  const handleSortChange = createTypedSelectChangeHandler(
    TEMPLATE_RANKING_AGGREGATE_ITEM_SORTS,
    onSortChange
  )
  const isFiltered = query.trim().length > 0

  return (
    <div className="rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface)] p-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex h-9 min-w-[220px] flex-1 items-center">
          <Search
            className="absolute left-2.5 h-3 w-3 text-[var(--t-text-faint)]"
            strokeWidth={2}
          />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search items…"
            aria-label="Search items"
            className="focus-custom h-full w-full rounded-md border border-[var(--t-border)] bg-[var(--t-bg-sunken)] pl-8 pr-8 text-[13px] text-[var(--t-text)] transition placeholder:text-[var(--t-text-faint)] hover:border-[var(--t-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              aria-label="Clear search"
              className="focus-custom absolute right-1.5 inline-flex h-6 w-6 items-center justify-center rounded text-[var(--t-text-muted)] hover:bg-[var(--t-bg-hover)] hover:text-[var(--t-text)]"
            >
              <X className="h-3 w-3" strokeWidth={2} />
            </button>
          )}
        </label>

        <label className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--t-border)] bg-[var(--t-bg-sunken)] pl-2.5 pr-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--t-text-faint)]">
          <SortAsc className="h-3 w-3" strokeWidth={2} />
          <span className="sr-only">Sort</span>
          <select
            value={sort}
            onChange={handleSortChange}
            className="focus-custom h-full bg-transparent pr-1 font-sans text-[12px] normal-case tracking-normal text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
          >
            {TEMPLATE_RANKING_AGGREGATE_ITEM_SORTS.map((value) => (
              <option key={value} value={value}>
                {SORT_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <div
          role="group"
          aria-label="Visualization mode"
          className="flex h-9 items-center rounded-md border border-[var(--t-border)] bg-[var(--t-bg-sunken)] p-0.5"
        >
          {VIZ_CONFIG.map(({ value, Icon, label }) =>
          {
            const active = vizMode === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => onVizModeChange(value)}
                title={label}
                aria-label={label}
                aria-pressed={active}
                className={`focus-custom inline-flex h-7 w-7 items-center justify-center rounded transition focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] ${
                  active
                    ? 'bg-[var(--t-bg-active)] text-[var(--t-text)]'
                    : 'text-[var(--t-text-muted)] hover:bg-[var(--t-bg-hover)] hover:text-[var(--t-text)]'
                }`}
              >
                <Icon className="h-3 w-3" strokeWidth={2} />
              </button>
            )
          })}
        </div>
      </div>

      {isFiltered && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--t-border)] pt-2 text-[11px] text-[var(--t-text-muted)]">
          <span className="font-mono uppercase tracking-[0.14em] text-[var(--t-text-faint)]">
            Showing {filteredCount} of {totalCount}
          </span>
          {query.trim().length > 0 && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              className="focus-custom inline-flex items-center gap-1 rounded-full border border-[var(--t-border)] px-2 py-0.5 text-[var(--t-text-secondary)] transition hover:border-[var(--t-border-hover)]"
            >
              “{query.trim()}”
              <X className="h-2.5 w-2.5" strokeWidth={2.5} />
            </button>
          )}
          <button
            type="button"
            onClick={() => onQueryChange('')}
            className="focus-custom ml-auto text-[var(--t-accent)] transition hover:text-[var(--t-accent-hover)]"
          >
            Clear search
          </button>
        </div>
      )}
    </div>
  )
}
