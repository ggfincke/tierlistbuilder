// src/features/workspace/boards/ui/board-chrome/BoardPublishChip.tsx
// publish-state chip — Draft muted, WIP filled w/ chunky shadow, Live
// filled + pulse. Renders nothing on empty boards to avoid double-empty.

import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import {
  getPublishStateVisual,
  selectPublishState,
} from '~/features/workspace/boards/model/publishState'
import { CHUNKY_SHADOW_ACCENT_STATIC } from '~/shared/ui/chunkyShadow'
import { LivePulse } from '~/shared/ui/LivePulse'

const FILLED_TONE_CLASS = `border-[var(--t-accent)] bg-[var(--t-accent)] text-[var(--t-accent-foreground)] ${CHUNKY_SHADOW_ACCENT_STATIC}`

const TONE_CLASS: Record<'neutral' | 'accent' | 'live', string> = {
  neutral:
    'border-[var(--t-border-secondary)] bg-transparent text-[var(--t-text-muted)]',
  accent: FILLED_TONE_CLASS,
  live: FILLED_TONE_CLASS,
}

export const BoardPublishChip = () =>
{
  const publishState = useActiveBoardStore(selectPublishState)
  const visual = getPublishStateVisual(publishState)
  if (!visual) return null

  const toneClass = TONE_CLASS[visual.tone]
  return (
    <span
      role="status"
      title={visual.description}
      aria-label={`Publish state: ${visual.label}. ${visual.description}`}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 font-semibold uppercase tracking-[0.16em] ${toneClass}`}
      style={{
        fontFamily: 'var(--ts-mono)',
        fontSize: '9px',
      }}
    >
      {visual.tone === 'live' && <LivePulse size={5} srLabel="Live" />}
      <span>{visual.label}</span>
    </span>
  )
}
