// src/features/workspace/export/ui/ExportProgressOverlay.tsx
// full-screen overlay shown during multi-board export to block interaction & show progress

import { useId, useRef } from 'react'

import { BaseModal } from '@/shared/overlay/BaseModal'

interface ExportProgressOverlayProps
{
  current: number
  total: number
}

export const ExportProgressOverlay = ({
  current,
  total,
}: ExportProgressOverlayProps) =>
{
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  const progressbarRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const statusId = useId()

  return (
    <BaseModal
      open={true}
      labelledBy={titleId}
      describedBy={statusId}
      closeOnEscape={false}
      closeOnBackdrop={false}
      panelClassName="w-72 px-6 py-5 shadow-black/40"
    >
      <h2
        id={titleId}
        className="text-center text-sm font-semibold text-[var(--t-text)]"
      >
        Exporting Boards
      </h2>
      <p
        id={statusId}
        className="mt-1 text-center text-sm text-[var(--t-text-secondary)]"
        aria-live="polite"
      >
        Exporting… {current} of {total}
      </p>
      <div
        ref={progressbarRef}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Export progress: ${pct}%`}
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--t-bg-active)]"
      >
        <div
          className="h-full rounded-full bg-[var(--t-accent)] transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </BaseModal>
  )
}
