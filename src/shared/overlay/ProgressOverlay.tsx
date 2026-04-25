// src/shared/overlay/ProgressOverlay.tsx
// blocking modal for long-running progress

import { useId } from 'react'

import { BaseModal } from './BaseModal'
import { resolveProgressOverlayState } from './progress'

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
  const titleId = useId()
  const statusId = useId()
  const progress = resolveProgressOverlayState(current, total)

  if (!progress.visible)
  {
    return null
  }

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
        {statusVerb}... {progress.current} of {progress.total}
      </p>
      <div
        role="progressbar"
        aria-valuenow={progress.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${progressLabel}: ${progress.percent}%`}
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--t-bg-active)]"
      >
        <div
          className="h-full rounded-full bg-[var(--t-accent)] transition-all duration-200"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
    </BaseModal>
  )
}
