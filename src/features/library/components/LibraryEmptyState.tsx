// src/features/library/components/LibraryEmptyState.tsx
// shown when filtering yields zero rows OR the user has zero boards

import { Plus } from 'lucide-react'

import { Button } from '~/shared/ui/Button'

interface LibraryEmptyStateProps
{
  mode: 'filtered' | 'first-time'
  onClearFilter?: () => void
  onCreate?: () => void
  createPending?: boolean
}

export const LibraryEmptyState = ({
  mode,
  onClearFilter,
  onCreate,
  createPending = false,
}: LibraryEmptyStateProps) => (
  <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--t-border-secondary)] bg-[rgb(var(--t-overlay)/0.02)] px-9 py-16 text-center">
    {mode === 'first-time' && (
      <span
        aria-hidden
        className="font-black leading-[0.8] text-[var(--t-accent)]"
        style={{
          fontSize: '5rem',
          letterSpacing: '-0.05em',
          textShadow: '4px 4px 0 var(--t-accent-2)',
        }}
      >
        +
      </span>
    )}
    <h3 className="text-[22px] font-extrabold tracking-[-0.025em] text-[var(--t-text)]">
      {mode === 'filtered'
        ? 'Nothing matches that filter.'
        : 'Nothing on file yet.'}
    </h3>
    <p className="max-w-sm text-[13px] leading-relaxed text-[var(--t-text-muted)]">
      {mode === 'filtered'
        ? 'Try clearing the filter, or start a fresh board.'
        : 'Start from a blank pool — your saved rankings will land here.'}
    </p>
    <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
      {mode === 'filtered' && onClearFilter && (
        <Button variant="secondary" size="sm" onClick={onClearFilter}>
          Clear filter
        </Button>
      )}
      {onCreate && (
        <Button
          variant="primary"
          size="sm"
          onClick={onCreate}
          disabled={createPending}
          aria-busy={createPending || undefined}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
          {createPending ? 'Creating...' : 'New board'}
        </Button>
      )}
    </div>
  </div>
)
