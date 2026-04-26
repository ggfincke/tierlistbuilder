// src/features/marketplace/components/Mosaic.tsx
// tile-grid renderer for cover artwork — packs item images into a tight grid
// that mirrors tiermaker-style template thumbnails

import type { TemplateMediaRef } from '@tierlistbuilder/contracts/marketplace/template'

export type MosaicDensity = 'small' | 'default' | 'large' | 'hero'

interface MosaicProps
{
  items: readonly TemplateMediaRef[]
  density: MosaicDensity
  // gradient applied behind the tiles & shown through any unfilled cells when
  // there are fewer items than slots
  fallbackGradient: string
}

const DENSITY_CONFIG: Record<
  MosaicDensity,
  { cols: number; rows: number; gap: number }
> = {
  small: { cols: 4, rows: 3, gap: 2 },
  default: { cols: 5, rows: 3, gap: 2 },
  large: { cols: 6, rows: 4, gap: 2 },
  hero: { cols: 8, rows: 5, gap: 3 },
}

export const Mosaic = ({ items, density, fallbackGradient }: MosaicProps) =>
{
  const { cols, rows, gap } = DENSITY_CONFIG[density]
  const slotCount = cols * rows
  const tiles = items.slice(0, slotCount)

  return (
    <div
      className="absolute inset-0"
      style={{ background: fallbackGradient }}
      aria-hidden="true"
    >
      <div
        className="grid h-full w-full"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          gap: `${gap}px`,
          padding: `${gap}px`,
        }}
      >
        {tiles.map((media, i) => (
          <div
            key={`${media.externalId}-${i}`}
            className="overflow-hidden rounded-[2px] bg-black/30"
          >
            <img
              src={media.url}
              alt=""
              loading="lazy"
              draggable={false}
              className="h-full w-full object-cover"
            />
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/55" />
    </div>
  )
}
