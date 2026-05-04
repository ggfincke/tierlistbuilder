// src/features/library/components/LibraryEmptyState.tsx
// shown when filtering yields zero rows OR the user has zero boards

import { Layers, Plus } from 'lucide-react'

import { Button } from '~/shared/ui/Button'

interface LibraryEmptyStateProps
{
  // distinguishes filter-driven empty from first-time empty (copy + CTA differ)
  filtered: boolean
  onClearFilter?: () => void
  onCreate?: () => void
  createPending?: boolean
}

export const LibraryEmptyState = ({
  filtered,
  onClearFilter,
  onCreate,
  createPending = false,
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
        ? 'Try clearing the filter, or start a blank list.'
        : 'Start from a blank pool — your saved rankings will land here.'}
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
      {onCreate && (
        <Button
          variant="primary"
          size="sm"
          onClick={onCreate}
          disabled={createPending}
          aria-busy={createPending || undefined}
          className="rounded-full px-4 py-2 text-[12px] font-semibold"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
          {createPending ? 'Creating...' : 'New list'}
        </Button>
      )}
    </div>
  </div>
)
