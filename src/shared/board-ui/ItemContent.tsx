// src/shared/board-ui/ItemContent.tsx
// shared image-vs-text item rendering primitive

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

interface ItemContentProps
{
  item: {
    imageRef?: TierItemImageRef
    sourceImageRef?: TierItemImageRef
    label?: string
    backgroundColor?: string
    altText?: string
    aspectRatio?: number
    transform?: ItemTransform
  }
  variant?: 'default' | 'compact'
  showLabel?: boolean
  frameAspectRatio?: number
  // effective image fit — resolved by the caller from per-item + board defaults.
  // ignored when `item.transform` is set (the manual transform wins)
  fit?: ImageFit
}

export const ItemContent = ({
  item,
  variant = 'default',
  showLabel = false,
  frameAspectRatio = 1,
  fit = 'cover',
}: ItemContentProps) =>
{
  const bgColor = item.backgroundColor
  const transform =
    item.transform && !isIdentityTransform(item.transform)
      ? item.transform
      : undefined
  const preferSource = !!transform && !!item.sourceImageRef
  const sourceImageUrl = useImageUrl(
    preferSource ? item.sourceImageRef?.hash : undefined
  )
  const displayImageUrl = useImageUrl(item.imageRef?.hash)
  const imageUrl = sourceImageUrl ?? displayImageUrl

  if (imageUrl)
  {
    const cropSize = transform
      ? resolveManualCropImageSize(
          item.aspectRatio,
          frameAspectRatio,
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

    return (
      <>
        <img
          src={imageUrl}
          alt={item.altText ?? item.label ?? 'Tier item'}
          className={imgClassName}
          style={imgStyle}
          draggable={false}
        />
        {showLabel && item.label && (
          <div className="absolute right-0 bottom-0 left-0 bg-black/60 px-1 py-0.5">
            <span className="block truncate text-center text-[10px] text-white">
              {item.label}
            </span>
          </div>
        )}
      </>
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
