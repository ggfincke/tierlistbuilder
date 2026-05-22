// src/features/marketplace/ui/discovery/CategoryChips.tsx
// horizontal pill row for filtering the main grid by template category, w/
// per-category counts when stats have resolved — built on the shared Chip

import type { TemplateCategory } from '@tierlistbuilder/contracts/marketplace/category'

import { CATEGORY_LIST } from '~/features/marketplace/model/categories'
import { formatCount } from '~/shared/catalog/formatters'
import { Chip } from '~/shared/ui/Chip'

interface CategoryChipsProps
{
  active: TemplateCategory | null
  onChange: (next: TemplateCategory | null) => void
  // sparse map of public template counts — undefined while stats load.
  // missing categories render as 0
  counts?: Record<string, number>
  totalCount?: number
}

export const CategoryChips = ({
  active,
  onChange,
  counts,
  totalCount,
}: CategoryChipsProps) => (
  <div
    role="group"
    aria-label="Template categories"
    className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1"
  >
    <Chip
      label="All"
      count={totalCount === undefined ? undefined : formatCount(totalCount)}
      active={active === null}
      onClick={() => onChange(null)}
    />
    {CATEGORY_LIST.map((cat) => (
      <Chip
        key={cat.id}
        label={cat.label}
        count={counts ? formatCount(counts[cat.id] ?? 0) : undefined}
        active={active === cat.id}
        onClick={() => onChange(cat.id)}
      />
    ))}
  </div>
)
