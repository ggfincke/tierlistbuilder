// src/features/marketplace/components/Mosaic.tsx
// tile-grid cover renderer — packs items into a grid over the media matte;
// tiles render through FramedItemMedia for parity w/ the detail item grid

import { useMemo } from 'react'

import type {
  ImageFit,
  ItemTransform,
} from '@tierlistbuilder/contracts/workspace/board'
import type { TemplateCoverItem } from '@tierlistbuilder/contracts/marketplace/template'
import { FramedItemMedia } from '~/shared/board-ui/FramedItemMedia'

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
  // board-wide fit fallback when an item has no per-item override; null
  // matches publisher-omitted -> 'cover'
  defaultImageFit?: ImageFit | null
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

const resolveFit = (
  itemFit: ImageFit | null,
  defaultFit: ImageFit | null | undefined
): ImageFit => itemFit ?? defaultFit ?? 'cover'

export const Mosaic = ({
  items,
  density,
  defaultImageFit,
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
          <CoverTile
            key={`${item.media.externalId}-${i}`}
            item={item}
            defaultImageFit={defaultImageFit}
            loading={loading}
            decoding={decoding}
          />
        ))}
        {Array.from({ length: emptyCount }).map((_, i) => (
          <div key={`empty-${i}`} className="bg-[var(--t-media-matte)]" />
        ))}
      </div>
    </MediaMatteFrame>
  )
}

interface CoverTileProps
{
  item: TemplateCoverItem
  defaultImageFit: ImageFit | null | undefined
  loading: MediaLoading
  decoding: MediaDecoding
}

const CoverTile = ({
  item,
  defaultImageFit,
  loading,
  decoding,
}: CoverTileProps) =>
{
  const transform: ItemTransform | null = item.transform
  const fit = resolveFit(item.imageFit, defaultImageFit)
  return (
    <div className="overflow-hidden bg-[var(--t-media-matte)]">
      <FramedItemMedia
        imageUrl={item.media.url}
        alt={item.label ?? ''}
        fit={fit}
        transform={transform}
        aspectRatio={item.aspectRatio}
        backgroundColor={item.backgroundColor}
        loading={loading}
        decoding={decoding}
      />
    </div>
  )
}
