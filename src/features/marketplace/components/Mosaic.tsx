// src/features/marketplace/components/Mosaic.tsx
// tile-grid renderer for cover artwork — packs item images into a tight grid
// over the neutral media matte

import { useMemo } from 'react'

import type { TemplateCoverItem } from '@tierlistbuilder/contracts/marketplace/template'

import {
  MediaMatteFrame,
  type MediaDecoding,
  type MediaLoading,
} from './MediaMatteFrame'

export type MosaicDensity = 'small' | 'default' | 'large' | 'hero'

interface MosaicProps
{
  items: readonly TemplateCoverItem[]
  density: MosaicDensity
  loading?: MediaLoading
  decoding?: MediaDecoding
}

const DENSITY_CONFIG: Record<
  MosaicDensity,
  { cols: number; rows: number; gap: number }
> = {
  small: { cols: 4, rows: 2, gap: 1 },
  default: { cols: 4, rows: 3, gap: 1 },
  large: { cols: 5, rows: 3, gap: 2 },
  hero: { cols: 6, rows: 4, gap: 2 },
}

// pick a (cols, rows) inside the base bounds that fits itemCount w/ the
// fewest empty cells. ties broken by closest aspect ratio to the base grid
// so partial fills still feel like the same composition
const computeGridDims = (
  itemCount: number,
  baseCols: number,
  baseRows: number
): { cols: number; rows: number } =>
{
  if (itemCount <= 0) return { cols: baseCols, rows: baseRows }
  const baseSlots = baseCols * baseRows
  if (itemCount >= baseSlots) return { cols: baseCols, rows: baseRows }

  const baseRatio = baseCols / baseRows
  let bestCols = baseCols
  let bestRows = baseRows
  let bestScore = Number.POSITIVE_INFINITY
  for (let c = 1; c <= baseCols; c++)
  {
    for (let r = 1; r <= baseRows; r++)
    {
      const slots = c * r
      if (slots < itemCount) continue
      const empty = slots - itemCount
      const ratioDiff = Math.abs(c / r - baseRatio)
      const score = empty * 100 + ratioDiff
      if (score < bestScore)
      {
        bestScore = score
        bestCols = c
        bestRows = r
      }
    }
  }
  return { cols: bestCols, rows: bestRows }
}

export const Mosaic = ({
  items,
  density,
  loading = 'lazy',
  decoding = 'async',
}: MosaicProps) =>
{
  const { cols: baseCols, rows: baseRows, gap } = DENSITY_CONFIG[density]
  const baseSlotCount = baseCols * baseRows
  const tiles = items.slice(0, baseSlotCount)
  const { cols, rows } = useMemo(
    () => computeGridDims(tiles.length, baseCols, baseRows),
    [tiles.length, baseCols, baseRows]
  )
  const slotCount = cols * rows
  const emptyCount = slotCount - tiles.length

  return (
    <MediaMatteFrame className="absolute inset-0">
      <div
        className="grid h-full w-full"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          gap: `${gap}px`,
        }}
      >
        {tiles.map((item, i) => (
          <MediaMatteFrame
            key={`${item.media.externalId}-${i}`}
            src={item.media.url}
            width={item.media.width}
            height={item.media.height}
            loading={loading}
            decoding={decoding}
            className="overflow-hidden"
          />
        ))}
        {Array.from({ length: emptyCount }).map((_, i) => (
          <div key={`empty-${i}`} className="bg-[var(--t-media-matte)]" />
        ))}
      </div>
    </MediaMatteFrame>
  )
}
