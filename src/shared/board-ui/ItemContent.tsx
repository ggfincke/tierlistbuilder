// src/shared/board-ui/ItemContent.tsx
// shared image-vs-text item rendering primitive

import { useImageUrl } from '~/shared/hooks/useImageUrl'
import type {
  ImageFit,
  TierItemImageRef,
} from '@tierlistbuilder/contracts/workspace/board'
import { getTextColor } from '../lib/color'
import { OBJECT_FIT_CLASS } from './constants'

interface ItemContentProps
{
  item: {
    imageRef?: TierItemImageRef
    label?: string
    backgroundColor?: string
    altText?: string
  }
  variant?: 'default' | 'compact'
  showLabel?: boolean
  // effective image fit — resolved by the caller from per-item + board defaults
  fit?: ImageFit
}

export const ItemContent = ({
  item,
  variant = 'default',
  showLabel = false,
  fit = 'cover',
}: ItemContentProps) =>
{
  const bgColor = item.backgroundColor
  const imageUrl = useImageUrl(
    item.imageRef?.hash,
    item.imageRef?.cloudMediaExternalId
  )

  if (imageUrl)
  {
    return (
      <>
        <img
          src={imageUrl}
          alt={item.altText ?? item.label ?? 'Tier item'}
          className={`h-full w-full ${OBJECT_FIT_CLASS[fit]}`}
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
