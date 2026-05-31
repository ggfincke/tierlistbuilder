// src/app/shells/topNav/TopNavAccountControl.tsx
// preferences trigger for the local-only chrome

import { SlidersHorizontal } from 'lucide-react'

import type { TopNavModalKey } from '~/app/shells/topNav/TopNavModalLayer'

interface TopNavAccountControlProps
{
  onOpenModal: (key: TopNavModalKey) => void
}

export const TopNavAccountControl = ({
  onOpenModal,
}: TopNavAccountControlProps) => (
  <button
    type="button"
    aria-label="Open preferences"
    title="Open preferences"
    onClick={() => onOpenModal('preferences')}
    className="focus-custom pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-[var(--t-border)] bg-[var(--t-bg-surface)]/85 text-[var(--t-text-muted)] backdrop-blur transition hover:border-[var(--t-border-secondary)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
  >
    <SlidersHorizontal className="h-4 w-4" strokeWidth={1.8} aria-hidden />
  </button>
)
