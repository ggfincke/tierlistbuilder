// src/shared/board-ui/MosaicGrid.tsx
// generic tile-grid — fixed cellAspect cells laid from the top-left that fill
// the container, clipping only the right/bottom overflow; big lists downsample

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'

import { joinClassNames } from '~/shared/lib/className'
import { computeGridDims } from './mosaicGridDims'

interface MosaicGridProps<T>
{
  items: readonly T[]
  // per-surface tile cap; larger lists downsample to this many slots
  maxSlots: number
  // item slot aspect (w/h); steers cols/rows so cells render near it
  cellAspect: number
  // must return a keyed element — it becomes a direct grid cell
  renderTile: (item: T, index: number) => ReactNode
  // extra classes on the matte-backed frame (defaults to a full-bleed cover)
  className?: string
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

// pick `count` items at evenly-spaced indices, preserving original order — a
// representative cross-section of the list without shuffling
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

export const MosaicGrid = <T,>({
  items,
  maxSlots,
  cellAspect,
  renderTile,
  className,
}: MosaicGridProps<T>) =>
{
  const frameRef = useRef<HTMLDivElement>(null)
  const safeAspect = cellAspect > 0 ? cellAspect : 1
  const coverAspect = useElementAspect(frameRef, 1)

  const { cols, rows } = useMemo(
    () => computeGridDims(items.length, maxSlots, coverAspect, safeAspect),
    [items.length, maxSlots, coverAspect, safeAspect]
  )

  const slotCount = cols * rows
  const tiles = useMemo(() => sampleItems(items, slotCount), [items, slotCount])

  // cells stay at cellAspect (tiles auto-crop to it) & the grid cover-fills from
  // the top-left: bind the overflowing axis so it bleeds past the short one,
  // anchored top-left so only the right/bottom edge clips (never left/top)
  const gridAspect = (cols * safeAspect) / rows
  const coverByHeight = gridAspect > coverAspect

  return (
    <div
      ref={frameRef}
      className={joinClassNames(
        'absolute inset-0 flex items-start justify-start overflow-hidden bg-[var(--t-media-matte)]',
        className
      )}
      aria-hidden="true"
    >
      <div
        className="grid shrink-0"
        style={{
          aspectRatio: `${cols * safeAspect} / ${rows}`,
          width: coverByHeight ? 'auto' : '100%',
          height: coverByHeight ? '100%' : 'auto',
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {tiles.map((item, i) => renderTile(item, i))}
      </div>
    </div>
  )
}
