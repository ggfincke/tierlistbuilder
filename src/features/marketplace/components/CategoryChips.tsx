// src/features/marketplace/components/CategoryChips.tsx
// horizontal pill row for filtering the main grid by template category, w/
// per-category counts when stats have resolved

import type { TemplateCategory } from '@tierlistbuilder/contracts/marketplace/template'

import { CATEGORY_LIST } from '~/features/marketplace/model/categories'
import { formatCount } from '~/features/marketplace/model/formatters'

interface CategoryChipsProps
{
  active: TemplateCategory | null
  onChange: (next: TemplateCategory | null) => void
  // sparse map of public template counts — undefined while stats load.
  // missing categories render as 0
  counts?: Record<string, number>
  totalCount?: number
}

interface ChipProps
{
  label: string
  count?: number
  selected: boolean
  onClick: () => void
}

const Chip = ({ label, count, selected, onClick }: ChipProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    className={`focus-custom inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] ${
      selected
        ? 'bg-[var(--t-text)] text-[var(--t-bg-page)]'
        : 'border border-[var(--t-border)] bg-[var(--t-bg-surface)] text-[var(--t-text-secondary)] hover:border-[var(--t-border-hover)]'
    }`}
  >
    <span>{label}</span>
    {count !== undefined && (
      <span
        className={`text-[10px] font-mono tabular-nums ${
          selected ? 'text-[var(--t-bg-page)]/70' : 'text-[var(--t-text-faint)]'
        }`}
      >
        {formatCount(count)}
      </span>
    )}
  </button>
)

export const CategoryChips = ({
  active,
  onChange,
  counts,
  totalCount,
}: CategoryChipsProps) => (
  <div
    role="tablist"
    aria-label="Template categories"
    className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1"
  >
    <Chip
      label="All"
      count={totalCount}
      selected={active === null}
      onClick={() => onChange(null)}
    />
    {CATEGORY_LIST.map((cat) => (
      <Chip
        key={cat.id}
        label={cat.label}
        count={counts ? (counts[cat.id] ?? 0) : undefined}
        selected={active === cat.id}
        onClick={() => onChange(cat.id)}
      />
    ))}
  </div>
)
