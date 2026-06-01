// src/features/library/ui/chips/SyncChip.tsx
// sync-state chip — Local only / Synced / Syncing / Sync failed / Conflict.
// 'overlay' is icon-only over cover art; 'inline' adds the label on a surface

import type { SyncState } from '@tierlistbuilder/contracts/workspace/libraryBoard'

import { LIBRARY_SYNC_META } from '~/features/library/lib/statusMeta'

interface SyncChipProps
{
  state: SyncState
  variant?: 'overlay' | 'inline'
}

// neutral resting states stay faint; info (a clone in flight) is secondary;
// warn (failed/conflict) borrows the destructive hue to pull the eye
const TONE_TEXT: Record<'neutral' | 'info' | 'warn', string> = {
  neutral: 'text-[var(--t-text-muted)]',
  info: 'text-[var(--t-text-secondary)]',
  warn: 'text-[var(--t-destructive-hover)]',
}

export const SyncChip = ({ state, variant = 'inline' }: SyncChipProps) =>
{
  const meta = LIBRARY_SYNC_META[state]
  const Icon = meta.Icon
  const spinClass = meta.spin ? 'motion-safe:animate-spin' : ''

  if (variant === 'overlay')
  {
    return (
      <span
        title={meta.label}
        className={`inline-flex items-center justify-center rounded bg-black/55 p-1 backdrop-blur-sm ${TONE_TEXT[meta.tone]}`}
      >
        <Icon className={`h-3 w-3 ${spinClass}`} strokeWidth={2} aria-hidden />
        <span className="sr-only">{meta.label}</span>
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border border-[var(--t-border)] bg-[rgb(var(--t-overlay)/0.04)] px-1.5 py-0.5 text-[10px] font-medium ${TONE_TEXT[meta.tone]}`}
    >
      <Icon
        className={`h-2.5 w-2.5 ${spinClass}`}
        strokeWidth={2}
        aria-hidden
      />
      {meta.label}
    </span>
  )
}
