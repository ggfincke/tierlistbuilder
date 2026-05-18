// src/shared/board-ui/FramedItemMedia.tsx
// matte-backed framed image — shared by ItemContent's image branch & the
// marketplace cover Mosaic so collage tiles & item cards render identically

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'

import type {
  ImageFit,
  ItemTransform,
} from '@tierlistbuilder/contracts/workspace/board'
import { OBJECT_FIT_CLASS } from '~/shared/board-ui/constants'
import {
  buildManualCropImgStyle,
  isIdentityTransform,
} from '~/shared/lib/imageTransform'

interface FramedItemMediaProps
{
  imageUrl: string
  alt?: string
  fit?: ImageFit
  transform?: ItemTransform | null
  // intrinsic aspect ratio of the image (w/h); used to compute manual-crop
  // size. fall back to 1 if unknown
  aspectRatio?: number | null
  // initial slot aspect ratio (w/h) before the frame is measured. the
  // measured ratio takes over once layout settles
  frameAspectRatio?: number
  backgroundColor?: string | null
  loading?: 'eager' | 'lazy'
  decoding?: 'async' | 'auto' | 'sync'
  className?: string
  // extra content rendered above the image (e.g. label overlay)
  children?: ReactNode
  // ref-forwarding hook for callers that want the frame element
  frameRef?: RefObject<HTMLDivElement | null>
}

const MEASURED_ASPECT_RATIO_DELTA = 0.001

const getElementAspectRatio = (element: HTMLElement): number | null =>
{
  const { width, height } = element.getBoundingClientRect()
  return width > 0 && height > 0 ? width / height : null
}

// observed only when the caller asks for measured size — most items render
// w/o a manual crop, so the observer would be pure overhead per tile
const useMeasuredAspectRatio = (
  ref: RefObject<HTMLElement | null>,
  fallback: number,
  enabled: boolean
): number =>
{
  const [measured, setMeasured] = useState<number | null>(null)

  useLayoutEffect(() =>
  {
    if (!enabled) return
    const element = ref.current
    if (!element) return

    const update = () =>
    {
      const next = getElementAspectRatio(element)
      if (!next) return
      setMeasured((current) =>
        current !== null &&
        Math.abs(current - next) < MEASURED_ASPECT_RATIO_DELTA
          ? current
          : next
      )
    }

    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, enabled])

  return measured ?? fallback
}

export const FramedItemMedia = ({
  imageUrl,
  alt = '',
  fit = 'cover',
  transform: rawTransform,
  aspectRatio,
  frameAspectRatio = 1,
  backgroundColor,
  loading = 'lazy',
  decoding = 'async',
  className,
  children,
  frameRef,
}: FramedItemMediaProps) =>
{
  const internalRef = useRef<HTMLDivElement | null>(null)
  const ref = frameRef ?? internalRef
  const transform =
    rawTransform && !isIdentityTransform(rawTransform) ? rawTransform : null
  const measuredAspect = useMeasuredAspectRatio(
    ref,
    frameAspectRatio,
    transform !== null
  )

  const imgClassName = transform
    ? 'absolute max-w-none select-none'
    : `h-full w-full ${OBJECT_FIT_CLASS[fit]}`
  const imgStyle: CSSProperties | undefined = transform
    ? buildManualCropImgStyle(transform, {
        intrinsicAspect: aspectRatio ?? undefined,
        frameAspect: measuredAspect,
        willChangeTransform: true,
      })
    : undefined

  const baseClass = 'relative h-full w-full overflow-hidden'
  return (
    <div
      ref={ref}
      className={className ? `${baseClass} ${className}` : baseClass}
      style={backgroundColor ? { backgroundColor } : undefined}
    >
      <img
        src={imageUrl}
        alt={alt}
        className={imgClassName}
        style={imgStyle}
        loading={loading}
        decoding={decoding}
        draggable={false}
      />
      {children}
    </div>
  )
}
