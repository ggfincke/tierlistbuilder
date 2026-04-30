// src/features/library/components/NewListTile.tsx
// dashed "New list" CTA tile — first cell of the grid view; routes to templates

import { Plus } from 'lucide-react'
import { Link } from 'react-router-dom'

import { TEMPLATES_ROUTE_PATH } from '~/app/routes/pathname'

// stretch tile to the grid row; align beside content-driven BoardCards
export const NewListTile = () => (
  <Link
    to={TEMPLATES_ROUTE_PATH}
    aria-label="Create a new list from a template"
    className="focus-custom group flex h-full w-full min-w-0 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--t-border)] bg-[rgb(var(--t-overlay)/0.02)] p-4 text-center transition hover:border-[var(--t-border-hover)] hover:bg-[rgb(var(--t-overlay)/0.05)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
  >
    <span className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--t-border)] bg-[rgb(var(--t-overlay)/0.06)] text-[var(--t-text)] transition group-hover:border-[var(--t-border-hover)]">
      <Plus className="h-5 w-5" strokeWidth={2} aria-hidden />
    </span>
    <span className="text-[13px] font-semibold text-[var(--t-text)]">
      New list
    </span>
    <span className="max-w-[200px] text-[11px] text-[var(--t-text-muted)]">
      Pick a template or start from a blank pool
    </span>
  </Link>
)
