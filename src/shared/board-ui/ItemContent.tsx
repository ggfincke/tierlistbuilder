// src/shared/board-ui/ItemContent.tsx
// shared image-vs-text item rendering primitive

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'

import { useImageUrl } from '~/shared/hooks/useImageUrl'
import type {
  ImageFit,
  ItemTransform,
  TierItemImageRef,
} from '@tierlistbuilder/contracts/workspace/board'
import { getTextColor } from '../lib/color'
import { OBJECT_FIT_CLASS } from './constants'
import {
  isIdentityTransform,
  itemTransformToCropCss,
  resolveManualCropImageSize,
} from '~/shared/lib/imageTransform'
import { CaptionStrip, OverlayLabelBlock } from './labelBlocks'
import type { ResolvedLabelDisplay } from './labelDisplay'

interface ItemContentProps
{
  item: {
    imageRef?: TierItemImageRef
    sourceImageRef?: TierItemImageRef
    imageUrl?: string
    sourceImageUrl?: string
    label?: string
    backgroundColor?: string
    altText?: string
    aspectRatio?: number
    transform?: ItemTransform
  }
  variant?: 'default' | 'compact'
  // null hides the label entirely; resolve via resolveLabelDisplay before passing
  label?: ResolvedLabelDisplay | null
  frameAspectRatio?: number
  // effective image fit — resolved by the caller from per-item + board defaults.
  // ignored when `item.transform` is set (the manual transform wins)
  fit?: ImageFit
}

interface ImageAreaProps
{
  frameRef: RefObject<HTMLDivElement | null>
  imageUrl: string
  alt: string
  imgClassName: string
  imgStyle: CSSProperties | undefined
  overlay: ResolvedLabelDisplay | null
}

const ImageArea = ({
  frameRef,
  imageUrl,
  alt,
  imgClassName,
  imgStyle,
  overlay,
}: ImageAreaProps) => (
  <div ref={frameRef} className="relative h-full w-full overflow-hidden">
    <img
      src={imageUrl}
      alt={alt}
      className={imgClassName}
      style={imgStyle}
      draggable={false}
    />
    {overlay && overlay.placement.mode === 'overlay' && (
      <OverlayLabelBlock display={overlay} />
    )}
  </div>
)

const MEASURED_ASPECT_RATIO_DELTA = 0.001

const getElementAspectRatio = (element: HTMLElement): number | null =>
{
  const { width, height } = element.getBoundingClientRect()
  return width > 0 && height > 0 ? width / height : null
}

const useMeasuredAspectRatio = (
  ref: RefObject<HTMLElement | null>,
  fallback: number,
  measureKey: string
): number =>
{
  const [measuredAspectRatio, setMeasuredAspectRatio] = useState<number | null>(
    null
  )

  useLayoutEffect(() =>
  {
    const element = ref.current
    if (!element) return

    const update = () =>
    {
      const next = getElementAspectRatio(element)
      if (!next) return
      setMeasuredAspectRatio((current) =>
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
  }, [measureKey, ref])

  return measuredAspectRatio ?? fallback
}

// stable string hash of the placement so the measured-aspect effect only
// re-runs when caption layout actually changes (avoids object-identity churn)
const placementKey = (label: ResolvedLabelDisplay | null): string =>
{
  if (!label) return 'none'
  const p = label.placement
  return p.mode === 'overlay'
    ? `overlay:${p.x.toFixed(3)}:${p.y.toFixed(3)}`
    : p.mode
}

export const ItemContent = ({
  item,
  variant = 'default',
  label = null,
  frameAspectRatio = 1,
  fit = 'cover',
}: ItemContentProps) =>
{
  const bgColor = item.backgroundColor
  const transform =
    item.transform && !isIdentityTransform(item.transform)
      ? item.transform
      : undefined
  const preferSource =
    !!transform && (!!item.sourceImageRef || !!item.sourceImageUrl)
  const cachedSourceImageUrl = useImageUrl(
    preferSource && !item.sourceImageUrl
      ? item.sourceImageRef?.hash
      : undefined,
    preferSource && !item.sourceImageUrl
      ? item.sourceImageRef?.cloudMediaExternalId
      : undefined
  )
  const cachedDisplayImageUrl = useImageUrl(
    item.imageUrl ? undefined : item.imageRef?.hash,
    item.imageUrl ? undefined : item.imageRef?.cloudMediaExternalId
  )
  const sourceImageUrl = preferSource
    ? (item.sourceImageUrl ?? cachedSourceImageUrl)
    : null
  const displayImageUrl = item.imageUrl ?? cachedDisplayImageUrl
  const imageUrl = sourceImageUrl ?? displayImageUrl
  const imageAreaRef = useRef<HTMLDivElement | null>(null)
  const imageFrameAspectRatio = useMeasuredAspectRatio(
    imageAreaRef,
    frameAspectRatio,
    `${imageUrl ?? ''}:${frameAspectRatio}:${placementKey(label)}:${label?.fontSizePx ?? 'none'}`
  )

  if (imageUrl)
  {
    const cropSize = transform
      ? resolveManualCropImageSize(
          item.aspectRatio,
          imageFrameAspectRatio,
          transform.rotation
        )
      : null
    const cropCss = transform ? itemTransformToCropCss(transform) : null
    const imgClassName = transform
      ? 'absolute max-w-none select-none'
      : `h-full w-full ${OBJECT_FIT_CLASS[fit]}`
    const imgStyle = transform
      ? {
          width: `${cropSize!.widthPercent}%`,
          height: `${cropSize!.heightPercent}%`,
          left: cropCss!.left,
          top: cropCss!.top,
          transform: cropCss!.transform,
          transformOrigin: 'center center',
          // suppress safari sub-pixel jitter on scaled images
          willChange: 'transform' as const,
        }
      : undefined
    const alt = item.altText ?? item.label ?? 'Tier item'
    const placementMode = label?.placement.mode

    if (label && placementMode === 'captionBelow')
    {
      return (
        <div className="flex h-full w-full flex-col">
          <div className="relative min-h-0 flex-1">
            <ImageArea
              frameRef={imageAreaRef}
              imageUrl={imageUrl}
              alt={alt}
              imgClassName={imgClassName}
              imgStyle={imgStyle}
              overlay={null}
            />
          </div>
          <CaptionStrip display={label} />
        </div>
      )
    }

    if (label && placementMode === 'captionAbove')
    {
      return (
        <div className="flex h-full w-full flex-col">
          <CaptionStrip display={label} />
          <div className="relative min-h-0 flex-1">
            <ImageArea
              frameRef={imageAreaRef}
              imageUrl={imageUrl}
              alt={alt}
              imgClassName={imgClassName}
              imgStyle={imgStyle}
              overlay={null}
            />
          </div>
        </div>
      )
    }

    return (
      <ImageArea
        frameRef={imageAreaRef}
        imageUrl={imageUrl}
        alt={alt}
        imgClassName={imgClassName}
        imgStyle={imgStyle}
        overlay={label}
      />
    )
  }

  return (
    <div
      className={`flex h-full w-full items-center justify-center ${
        bgColor ? '' : 'bg-[var(--t-bg-surface)] text-[var(--t-text)]'
      } ${variant === 'compact' ? 'p-0.5' : 'p-1'}`}
      style={
        bgColor
          ? { backgroundColor: bgColor, color: getTextColor(bgColor) }
          : undefined
      }
    >
      <span
        className={`font-semibold break-words text-center [overflow-wrap:anywhere] ${
          variant === 'compact' ? 'text-[10px] leading-tight' : 'text-xs'
        }`}
      >
        {item.label}
      </span>
    </div>
  )
}
