// src/shared/board-ui/PlateInsetFrame.tsx
// floats its child off the cell edge by `padding` (fraction per edge) so a
// surrounding plate/backdrop shows through the margin (no-op at padding <= 0)

import type { ReactNode } from 'react'

interface PlateInsetFrameProps
{
  // inset fraction applied to every edge (0 -> full-bleed)
  padding: number
  children: ReactNode
}

export const PlateInsetFrame = ({
  padding,
  children,
}: PlateInsetFrameProps) =>
{
  if (padding <= 0) return <>{children}</>
  // an absolutely-positioned inset box: a child img's percentage (manual-crop)
  // geometry resolves against this frame, keeping the editor preview & the live
  // board render pixel-identical, so the inset math lives here once
  return (
    <div
      className="absolute overflow-hidden"
      style={{ inset: `${(padding * 100).toFixed(4)}%` }}
    >
      {children}
    </div>
  )
}
