// src/features/marketplace/components/Mosaic.tsx
// tile-grid cover renderer — cells use the template's slot aspect, the grid
// centers in the matte, & oversized lists are downsampled to the cap

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'

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
import { computeGridDims } from './mosaicGrid'

export type MosaicDensity = 'small' | 'default' | 'large' | 'hero'

interface MosaicProps
{
  items: readonly TemplateCoverItem[]
  density: MosaicDensity
  defaultImageFit?: ImageFit | null
  templateAspectRatio?: number | null
  loading?: MediaLoading
  decoding?: MediaDecoding
}

// per-density item caps. small allows 6x2/5x2 fits on wide h-32 rails (3x3
// gets too narrow vs the cover aspect); default/large open to 3+ rows so big
// rosters read as a content wall vs a marquee; hero scales for huge templates
const MAX_SLOTS: Record<MosaicDensity, number> = {
  small: 12,
  default: 18,
  large: 24,
  hero: 80,
}

const useElementAspect = (
  ref: RefObject<HTMLElement | null>,
  fallback: number
): number =>
{
  const [aspect, setAspect] = useState(fallback)

  useLayoutEffect(() =>
  {
    const element = ref.current
    if (!element) return

    const update = () =>
    {
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const next = rect.width / rect.height
      setAspect((prev) => (Math.abs(prev - next) < 0.001 ? prev : next))
    }

    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return aspect
}

// pick `count` items at evenly-spaced indices, preserving original order.
// gives a representative cross-section of the list without shuffling, so
// the cover reflects the template's natural ordering
const sampleItems = <T,>(items: readonly T[], count: number): readonly T[] =>
{
  if (items.length <= count) return items
  if (count <= 0) return []
  if (count === 1) return [items[0]]
  const step = (items.length - 1) / (count - 1)
  const out: T[] = new Array(count)
  for (let i = 0; i < count; i++)
  {
    out[i] = items[Math.round(i * step)]
  }
  return out
}

const resolveFit = (
  itemFit: ImageFit | null,
  defaultFit: ImageFit | null | undefined
): ImageFit => itemFit ?? defaultFit ?? 'cover'

export const Mosaic = ({
  items,
  density,
  defaultImageFit,
  templateAspectRatio,
  loading = 'lazy',
  decoding = 'async',
}: MosaicProps) =>
{
  const frameRef = useRef<HTMLDivElement>(null)
  const cellAspect =
    templateAspectRatio && templateAspectRatio > 0 ? templateAspectRatio : 1
  const coverAspect = useElementAspect(frameRef, 1)
  const maxSlots = MAX_SLOTS[density]

  const { cols, rows } = useMemo(
    () => computeGridDims(items.length, maxSlots, coverAspect, cellAspect),
    [items.length, maxSlots, coverAspect, cellAspect]
  )

  const slotCount = cols * rows
  const tiles = useMemo(() => sampleItems(items, slotCount), [items, slotCount])

  // grid is bound by the wider-relative axis (width when gridAspect >
  // coverAspect, else height). aspect-ratio derives the other axis so cells
  // resolve to cellAspect, & the flex wrapper centers any leftover matte
  const gridAspect = (cols * cellAspect) / rows
  const widthBound = gridAspect > coverAspect

  return (
    <MediaMatteFrame className="absolute inset-0 overflow-hidden">
      <div
        ref={frameRef}
        className="flex h-full w-full items-center justify-center p-3"
      >
        <div
          className="grid"
          style={{
            aspectRatio: `${cols * cellAspect} / ${rows}`,
            width: widthBound ? '100%' : 'auto',
            height: widthBound ? 'auto' : '100%',
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
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
        </div>
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
    <div className="relative h-full w-full overflow-hidden bg-[var(--t-media-matte)]">
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
