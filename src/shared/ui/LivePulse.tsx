// src/shared/ui/LivePulse.tsx
// pulsing accent dot for Scoreboard "LIVE NOW" eyebrows. Pulse keyframes
// live in index.css so prefers-reduced-motion stops the animation.

import type { CSSProperties } from 'react'

import { joinClassNames } from '~/shared/lib/className'

interface LivePulseProps
{
  // visually hidden text for screen readers — defaults to "Live"
  srLabel?: string
  // pixel size of the dot (default 6 to match the editorial eyebrow scale)
  size?: number
  className?: string
}

export const LivePulse = ({
  srLabel = 'Live',
  size = 6,
  className,
}: LivePulseProps) =>
{
  const dotStyle: CSSProperties = {
    width: size,
    height: size,
    backgroundColor: 'var(--t-accent)',
    animation: 'scoreboardPulse 1.8s ease-in-out infinite',
  }
  return (
    <span
      role="status"
      className={joinClassNames('inline-flex shrink-0 items-center', className)}
    >
      <span
        aria-hidden
        className="inline-block rounded-full"
        style={dotStyle}
      />
      <span className="sr-only">{srLabel}</span>
    </span>
  )
}
