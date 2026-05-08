// src/features/marketplace/components/discovery/InitialsGrid.tsx
// label-initials cover — short codes from labels in a matte grid; missing
// labels fall back to a stable code derived from the media externalId

import type { TemplateCoverItem } from '@tierlistbuilder/contracts/marketplace/template'

import { externalIdToCode, labelToCode } from '~/shared/board-ui/initialsCode'
import type { MosaicDensity } from './Mosaic'

interface InitialsGridProps
{
  items: readonly TemplateCoverItem[]
  density: MosaicDensity
}

const DENSITY_CONFIG: Record<
  MosaicDensity,
  {
    cols: number
    rows: number
    gap: number
    fontPx: number
    // outer vertical padding leaves a clean dark strip at the top/bottom of
    // the cover so card badges & meta bands don't fight w/ the first row of
    // cells. horizontal padding stays at gap so cells span edge-to-edge
    padY: number
  }
> = {
  small: { cols: 5, rows: 3, gap: 4, fontPx: 11, padY: 4 },
  default: { cols: 5, rows: 3, gap: 5, fontPx: 13, padY: 18 },
  large: { cols: 5, rows: 3, gap: 6, fontPx: 15, padY: 22 },
  hero: { cols: 5, rows: 3, gap: 8, fontPx: 22, padY: 28 },
}

const resolveCode = (
  label: string | null | undefined,
  item: TemplateCoverItem
): string =>
{
  if (label && label.trim())
  {
    const fromLabel = labelToCode(label)
    if (fromLabel) return fromLabel
  }
  return externalIdToCode(item.media.externalId)
}

export const InitialsGrid = ({ items, density }: InitialsGridProps) =>
{
  const { cols, rows, gap, fontPx, padY } = DENSITY_CONFIG[density]
  const slotCount = cols * rows
  const tiles = items.slice(0, slotCount)

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
          padding: `${padY}px ${gap}px`,
        }}
      >
        {tiles.map((item, i) =>
        {
          const code = resolveCode(item.label, item)
          return (
            <div
              key={`${item.media.externalId}-${i}`}
              className="flex items-center justify-center overflow-hidden rounded-md bg-black/15 ring-1 ring-inset ring-white/10"
            >
              <span
                className="font-semibold tracking-tight text-white/90 drop-shadow"
                style={{ fontSize: `${fontPx}px` }}
              >
                {code}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
