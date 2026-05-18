// src/shared/board-ui/FramedCoverImage.tsx
// renders a cover image inside a surface container, applying a per-surface
// frame so the chosen rect object-covers the container

import { useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { CoverFrame } from '@tierlistbuilder/contracts/marketplace/template'

import type {
  MediaDecoding,
  MediaLoading,
} from '~/shared/board-ui/mediaImageAttrs'
import { coverFramePlacementStyle } from '~/shared/board-ui/coverFramingStyles'
import { computeFramedPlacement } from '~/shared/board-ui/coverFramingPlacement'

interface FramedCoverImageProps
{
  src: string
  alt: string
  sourceWidth: number
  sourceHeight: number
  frame: CoverFrame | null
  loading?: MediaLoading
  decoding?: MediaDecoding
}

export const FramedCoverImage = ({
  src,
  alt,
  sourceWidth,
  sourceHeight,
  frame,
  loading = 'lazy',
  decoding = 'async',
}: FramedCoverImageProps) =>
{
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  })

  useLayoutEffect(() =>
  {
    const el = containerRef.current
    if (!el) return
    const measure = () =>
    {
      const r = el.getBoundingClientRect()
      setSize((prev) =>
      {
        const next = { width: r.width, height: r.height }
        if (prev.width === next.width && prev.height === next.height)
        {
          return prev
        }
        return next
      })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const placement = useMemo(
    () =>
      computeFramedPlacement({
        frame,
        containerWidth: size.width,
        containerHeight: size.height,
        sourceWidth,
        sourceHeight,
      }),
    [frame, size.width, size.height, sourceWidth, sourceHeight]
  )

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden bg-[var(--t-media-matte)]"
    >
      {placement && (
        <img
          src={src}
          alt={alt}
          width={sourceWidth}
          height={sourceHeight}
          loading={loading}
          decoding={decoding}
          draggable={false}
          style={coverFramePlacementStyle(placement)}
        />
      )}
    </div>
  )
}
