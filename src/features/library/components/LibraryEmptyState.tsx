// src/features/library/components/LibraryEmptyState.tsx
// shown when filtering yields zero rows OR the user has zero boards

import { Layers } from 'lucide-react'
import { Link } from 'react-router-dom'

import { TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'

interface LibraryEmptyStateProps
{
  // distinguishes filter-driven empty from first-time empty (copy + CTA differ)
  filtered: boolean
  onClearFilter?: () => void
}

export const LibraryEmptyState = ({
  filtered,
  onClearFilter,
}: LibraryEmptyStateProps) => (
  <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--t-border)] bg-[rgb(var(--t-overlay)/0.02)] py-20 text-center">
    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[rgb(var(--t-overlay)/0.04)] text-[var(--t-text-muted)]">
      <Layers className="h-6 w-6" strokeWidth={1.6} aria-hidden />
    </div>
    <h3 className="text-[15px] font-semibold text-[var(--t-text)]">
      {filtered ? 'No lists match this filter' : 'No lists here yet'}
    </h3>
    <p className="max-w-sm text-[12px] text-[var(--t-text-muted)]">
      {filtered
        ? 'Try clearing the filter, or fork a template to start a new ranking.'
        : 'Fork a template or start from a blank pool — your saved rankings will land here.'}
    </p>
    <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
      {filtered && onClearFilter && (
        <button
          type="button"
          onClick={onClearFilter}
          className="focus-custom rounded-full border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-4 py-2 text-[12px] font-medium text-[var(--t-text)] transition hover:border-[var(--t-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
        >
          Clear filter
        </button>
      )}
      <Link
        to={TEMPLATES_ROUTE_PATH}
        className="focus-custom rounded-full bg-[var(--t-text)] px-4 py-2 text-[12px] font-semibold text-[var(--t-bg-page)] transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
      >
        Browse templates
      </Link>
    </div>
  </div>
)
