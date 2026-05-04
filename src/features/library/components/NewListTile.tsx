// src/features/library/components/NewListTile.tsx
// dashed "New list" CTA tile — creates a blank local list from grid view

import { Plus } from 'lucide-react'

interface NewListTileProps
{
  onCreate: () => void
  isPending: boolean
}

export const NewListTile = ({ onCreate, isPending }: NewListTileProps) => (
  <button
    type="button"
    onClick={onCreate}
    disabled={isPending}
    aria-label="Create a blank list"
    aria-busy={isPending || undefined}
    className="focus-custom group flex h-full w-full min-w-0 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--t-border)] bg-[rgb(var(--t-overlay)/0.02)] p-4 text-center transition hover:border-[var(--t-border-hover)] hover:bg-[rgb(var(--t-overlay)/0.05)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] disabled:cursor-progress disabled:opacity-70"
  >
    <span className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--t-border)] bg-[rgb(var(--t-overlay)/0.06)] text-[var(--t-text)] transition group-hover:border-[var(--t-border-hover)]">
      <Plus className="h-5 w-5" strokeWidth={2} aria-hidden />
    </span>
    <span className="text-[13px] font-semibold text-[var(--t-text)]">
      {isPending ? 'Creating...' : 'New list'}
    </span>
    <span className="max-w-[200px] text-[11px] text-[var(--t-text-muted)]">
      Start from a blank pool
    </span>
  </button>
)
