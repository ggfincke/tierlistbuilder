// src/features/library/ui/chips/PublishChip.tsx
// publish-state chip — Draft / WIP / Live. 'overlay' variant sits over cover
// art on a dark scrim; 'inline' sits on a themed surface. Live carries a pulse

import type { PublishState } from '@tierlistbuilder/contracts/workspace/board'

import { PUBLISH_STATE_META } from '~/shared/board-ui/publishStateMeta'

interface PublishChipProps
{
  state: PublishState
  variant?: 'overlay' | 'inline'
}

// text color per tone — Draft stays muted, WIP picks up the lime kicker, Live
// the primary accent. all three share a backdrop so they read over any cover
const TONE_TEXT: Record<'neutral' | 'accent' | 'live', string> = {
  neutral: 'text-[var(--t-text-muted)]',
  accent: 'text-[var(--t-accent-2)]',
  live: 'text-[var(--t-accent)]',
}

export const PublishChip = ({
  state,
  variant = 'inline',
}: PublishChipProps) =>
{
  const meta = PUBLISH_STATE_META[state]
  const surface =
    variant === 'overlay'
      ? 'bg-black/55 backdrop-blur-sm'
      : 'border border-[var(--t-border-secondary)] bg-[rgb(var(--t-overlay)/0.04)]'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] ${surface} ${TONE_TEXT[meta.tone]}`}
      style={{ fontFamily: 'var(--ts-mono)' }}
    >
      {meta.tone === 'live' && (
        <span
          aria-hidden
          className="h-1 w-1 rounded-full bg-current"
          style={{ animation: 'scoreboardPulse 1.8s ease-in-out infinite' }}
        />
      )}
      {meta.label}
    </span>
  )
}
