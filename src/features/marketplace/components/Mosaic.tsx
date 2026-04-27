// src/features/marketplace/components/Mosaic.tsx
// tile-grid renderer for cover artwork — packs item images into a tight grid
// w/ a subtle category gradient as backdrop & a soft inner ring

import type { TemplateCoverItem } from '@tierlistbuilder/contracts/marketplace/template'

export type MosaicDensity = 'small' | 'default' | 'large' | 'hero'

interface MosaicProps
{
  items: readonly TemplateCoverItem[]
  density: MosaicDensity
  // shown only inside placeholder cells when items < slotCount — a brand tint
  // instead of a colored frame around every tile
  fallbackGradient: string
}

const DENSITY_CONFIG: Record<
  MosaicDensity,
  { cols: number; rows: number; gap: number }
> = {
  small: { cols: 4, rows: 3, gap: 1 },
  default: { cols: 5, rows: 3, gap: 1 },
  large: { cols: 6, rows: 4, gap: 2 },
  hero: { cols: 8, rows: 5, gap: 2 },
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

export const Mosaic = ({ items, density, fallbackGradient }: MosaicProps) =>
{
  const { cols: baseCols, rows: baseRows, gap } = DENSITY_CONFIG[density]
  const baseSlotCount = baseCols * baseRows
  const tiles = items.slice(0, baseSlotCount)
  const { cols, rows } = computeGridDims(tiles.length, baseCols, baseRows)
  const slotCount = cols * rows
  const emptyCount = slotCount - tiles.length

  return (
    <div
      className="absolute inset-0 bg-[var(--t-media-matte)]"
      aria-hidden="true"
    >
      <div
        className="grid h-full w-full"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          gap: `${gap}px`,
        }}
      >
        {tiles.map((item, i) => (
          <div
            key={`${item.media.externalId}-${i}`}
            className="overflow-hidden bg-black/40"
          >
            <img
              src={item.media.url}
              alt=""
              loading="lazy"
              draggable={false}
              className="h-full w-full object-cover"
            />
          </div>
        ))}
        {Array.from({ length: emptyCount }).map((_, i) => (
          <div key={`empty-${i}`} style={{ background: fallbackGradient }} />
        ))}
      </div>
    </div>
  )
}
