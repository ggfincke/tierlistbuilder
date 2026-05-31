// src/features/library/ui/chrome/LibrarySignedOutState.tsx
// slim local-only banner above the My Boards grid

import { CloudOff } from 'lucide-react'

export const LibrarySignedOutState = () => (
  <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--t-border)] bg-[rgb(var(--t-overlay)/0.03)] px-4 py-3">
    <div className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[rgb(var(--t-overlay)/0.06)] text-[var(--t-text-muted)]">
        <CloudOff className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      </span>
      <p className="text-[12px] text-[var(--t-text-secondary)]">
        These boards live on this device only.
      </p>
    </div>
  </div>
)
