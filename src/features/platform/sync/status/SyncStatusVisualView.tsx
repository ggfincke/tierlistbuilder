// src/features/platform/sync/status/SyncStatusVisualView.tsx
// shared render for sync-status chrome — inline (list-row badge) & block
// (toolbar indicator) variants share aria attrs, icon-spin, & sr-only label

import type { ReactElement } from 'react'

import type { SyncStatusVisual } from './syncStatusVisuals'

interface SyncStatusVisualViewProps
{
  visual: SyncStatusVisual
  // inline — small h-4 badge for list rows; block — toolbar chrome matching
  // ActionButton height so status & actions share a baseline
  variant: 'inline' | 'block'
  // tooltip override; falls back to visual.description when omitted
  title?: string
  // sr-only label override; falls back to title / description
  srLabel?: string
}

const INLINE_WRAPPER =
  'inline-flex h-4 w-4 shrink-0 items-center justify-center'
const BLOCK_WRAPPER =
  'flex h-10 w-10 shrink-0 items-center justify-center max-sm:h-11 max-sm:w-11'

export const SyncStatusVisualView = ({
  visual,
  variant,
  title,
  srLabel,
}: SyncStatusVisualViewProps): ReactElement =>
{
  const resolvedTitle = title ?? visual.description
  const resolvedSrLabel = srLabel ?? resolvedTitle
  const isInline = variant === 'inline'
  const iconSizeClass = isInline ? 'h-3 w-3' : 'h-5 w-5'
  const strokeWidth = isInline ? 2 : 1.8
  const { Icon } = visual

  const body = (
    <>
      <Icon
        className={`${iconSizeClass} ${visual.spin ? 'animate-spin' : ''}`}
        strokeWidth={strokeWidth}
        aria-hidden="true"
      />
      <span className="sr-only">{resolvedSrLabel}</span>
    </>
  )

  if (isInline)
  {
    return (
      <span
        role="status"
        aria-live="polite"
        title={resolvedTitle}
        className={`${INLINE_WRAPPER} ${visual.colorClass}`}
      >
        {body}
      </span>
    )
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      title={resolvedTitle}
      className={`${BLOCK_WRAPPER} ${visual.colorClass}`}
    >
      {body}
    </div>
  )
}
