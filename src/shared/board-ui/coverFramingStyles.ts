// src/shared/board-ui/coverFramingStyles.ts
// cover framing CSS helpers shared by cover preview surfaces

import type { CSSProperties } from 'react'

import type { CoverFramePlacement } from './coverFramingPlacement'

export const coverFramePlacementStyle = (
  placement: CoverFramePlacement
): CSSProperties => ({
  position: 'absolute',
  left: `${placement.left}px`,
  top: `${placement.top}px`,
  width: `${placement.width}px`,
  height: `${placement.height}px`,
  maxWidth: 'none',
})
