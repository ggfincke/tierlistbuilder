// src/shared/overlay/ProgressOverlay.tsx
// shared blocking progress modal for long-running workspace tasks

import { useId } from 'react'

import { BaseModal } from './BaseModal'

interface ProgressOverlayProps
{
  title: string
  statusVerb: string
  progressLabel: string
  current: number
  total: number
}

export const ProgressOverlay = ({
  title,
  statusVerb,
  progressLabel,
  current,
  total,
}: ProgressOverlayProps) =>
{
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
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
        {title}
      </h2>
      <p
        id={statusId}
        className="mt-1 text-center text-sm text-[var(--t-text-secondary)]"
        aria-live="polite"
      >
        {statusVerb}… {current} of {total}
      </p>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${progressLabel}: ${pct}%`}
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
