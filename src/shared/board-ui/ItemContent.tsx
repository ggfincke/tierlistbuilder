// src/shared/board-ui/ItemContent.tsx
// shared image-vs-text item rendering primitive

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
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

// wraps content in a flex column w/ a CaptionStrip above or below — used by
// both the resolved-image & matte-while-loading branches so they stay
// layout-identical
const CaptionedFrame = ({
  caption,
  children,
}: {
  caption: ResolvedLabelDisplay
  children: ReactNode
}) =>
{
  const isAbove = caption.placement.mode === 'captionAbove'
  return (
    <div className="flex h-full w-full flex-col">
      {isAbove && <CaptionStrip display={caption} />}
      <div className="relative min-h-0 flex-1">{children}</div>
      {!isAbove && <CaptionStrip display={caption} />}
    </div>
  )
}

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

  // single useImageUrl subscription per render — the source variant takes
  // priority when a manual transform is active so the editor sees uncropped
  // pixels; otherwise the display tile variant is used
  const useSourceVariant = preferSource && !item.sourceImageUrl
  const useDisplayVariant = !useSourceVariant && !item.imageUrl
  const subscriberRef = useSourceVariant
    ? item.sourceImageRef
    : useDisplayVariant
      ? item.imageRef
      : undefined
  const subscriberVariant: 'editor' | 'tile' = useSourceVariant
    ? 'editor'
    : 'tile'
  const cachedImageUrl = useImageUrl(
    subscriberRef?.hash,
    subscriberRef?.cloudMediaExternalId,
    subscriberVariant
  )
  const sourceImageUrl = preferSource
    ? (item.sourceImageUrl ?? (useSourceVariant ? cachedImageUrl : null))
    : null
  const displayImageUrl =
    item.imageUrl ?? (useDisplayVariant ? cachedImageUrl : null)
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
    const isCaptioned =
      label &&
      (placementMode === 'captionAbove' || placementMode === 'captionBelow')
    const imageArea = (
      <ImageArea
        frameRef={imageAreaRef}
        imageUrl={imageUrl}
        alt={alt}
        imgClassName={imgClassName}
        imgStyle={imgStyle}
        overlay={isCaptioned ? null : label}
      />
    )

    return isCaptioned ? (
      <CaptionedFrame caption={label}>{imageArea}</CaptionedFrame>
    ) : (
      imageArea
    )
  }

  // image is expected (item carries a hash) but URL hasn't resolved yet —
  // cloud fetch in flight on first load, or IDB warm catching up. render a
  // flat matte so we don't flash the text fallback before the image lands
  if (item.imageRef?.hash || item.sourceImageRef?.hash)
  {
    const placementMode = label?.placement.mode
    const isCaptioned =
      label &&
      (placementMode === 'captionAbove' || placementMode === 'captionBelow')
    const matte = (
      <div
        ref={imageAreaRef}
        className="relative h-full w-full overflow-hidden bg-[var(--t-bg-surface)]"
      />
    )

    return isCaptioned ? (
      <CaptionedFrame caption={label}>{matte}</CaptionedFrame>
    ) : (
      matte
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
