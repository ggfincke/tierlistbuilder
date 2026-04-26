// src/features/marketplace/components/CategoryChips.tsx
// horizontal pill row for filtering the main grid by template category

import type { TemplateCategory } from '@tierlistbuilder/contracts/marketplace/template'

import { CATEGORY_LIST } from '~/features/marketplace/model/categories'

interface CategoryChipsProps
{
  active: TemplateCategory | null
  onChange: (next: TemplateCategory | null) => void
}

interface ChipProps
{
  label: string
  selected: boolean
  onClick: () => void
}

const Chip = ({ label, selected, onClick }: ChipProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    className={`focus-custom whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] ${
      selected
        ? 'bg-[var(--t-text)] text-[var(--t-bg-page)]'
        : 'border border-[var(--t-border)] bg-[var(--t-bg-surface)] text-[var(--t-text-secondary)] hover:border-[var(--t-border-hover)]'
    }`}
  >
    {label}
  </button>
)

export const CategoryChips = ({ active, onChange }: CategoryChipsProps) => (
  <div
    role="tablist"
    aria-label="Template categories"
    className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1"
  >
    <Chip
      label="All"
      selected={active === null}
      onClick={() => onChange(null)}
    />
    {CATEGORY_LIST.map((cat) => (
      <Chip
        key={cat.id}
        label={cat.label}
        selected={active === cat.id}
        onClick={() => onChange(cat.id)}
      />
    ))}
  </div>
)
