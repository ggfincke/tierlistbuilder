// src/shared/board-ui/ItemContent.tsx
// shared image-vs-text item rendering primitive

import { type ReactNode } from 'react'

import { useImageUrl } from '~/shared/hooks/useImageUrl'
import type {
  ImageFit,
  ItemTransform,
  TierItemImageRef,
} from '@tierlistbuilder/contracts/workspace/board'
import { getTextColor } from '../lib/color'
import { FramedItemMedia } from './FramedItemMedia'
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

export const ItemContent = ({
  item,
  variant = 'default',
  label = null,
  frameAspectRatio = 1,
  fit = 'cover',
}: ItemContentProps) =>
{
  const bgColor = item.backgroundColor
  const transform = item.transform
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
  const cachedImageUrl = useImageUrl(subscriberRef?.hash)
  const sourceImageUrl = preferSource
    ? (item.sourceImageUrl ?? (useSourceVariant ? cachedImageUrl : null))
    : null
  const displayImageUrl =
    item.imageUrl ?? (useDisplayVariant ? cachedImageUrl : null)
  const imageUrl = sourceImageUrl ?? displayImageUrl

  if (imageUrl)
  {
    const alt = item.altText ?? item.label ?? 'Tier item'
    const placementMode = label?.placement.mode
    const isCaptioned =
      label &&
      (placementMode === 'captionAbove' || placementMode === 'captionBelow')
    const imageArea = (
      <FramedItemMedia
        imageUrl={imageUrl}
        alt={alt}
        fit={fit}
        transform={transform ?? null}
        aspectRatio={item.aspectRatio ?? null}
        frameAspectRatio={frameAspectRatio}
      >
        {!isCaptioned && label && label.placement.mode === 'overlay' && (
          <OverlayLabelBlock display={label} />
        )}
      </FramedItemMedia>
    )

    return isCaptioned ? (
      <CaptionedFrame caption={label}>{imageArea}</CaptionedFrame>
    ) : (
      imageArea
    )
  }

  // image is expected (item carries a hash) but URL hasn't resolved yet.
  // render a flat matte so the text fallback doesn't flash before warm-up
  if (item.imageRef?.hash || item.sourceImageRef?.hash)
  {
    const placementMode = label?.placement.mode
    const isCaptioned =
      label &&
      (placementMode === 'captionAbove' || placementMode === 'captionBelow')
    const matte = (
      <div className="relative h-full w-full overflow-hidden bg-[var(--t-bg-surface)]" />
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
