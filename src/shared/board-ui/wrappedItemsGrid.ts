// src/shared/board-ui/wrappedItemsGrid.ts
// item-grid sizing helper for static wrapped board renders

import type { CSSProperties } from 'react'

interface WrappedItemsGridStyleOptions
{
  compactMode: boolean
  maxItemsPerRow?: number | null
  slotWidth: number
}

export const getWrappedItemsGridStyle = ({
  compactMode,
  maxItemsPerRow,
  slotWidth,
}: WrappedItemsGridStyleOptions): CSSProperties | undefined =>
{
  if (
    maxItemsPerRow === null ||
    maxItemsPerRow === undefined ||
    !Number.isFinite(maxItemsPerRow)
  )
  {
    return undefined
  }

  const columns = Math.max(1, Math.floor(maxItemsPerRow))
  const gapPx = compactMode ? 0 : 1

  return {
    flex: '0 0 auto',
    width: columns * slotWidth + Math.max(0, columns - 1) * gapPx,
  }
}
