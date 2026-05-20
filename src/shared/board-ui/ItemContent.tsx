// src/shared/board-ui/ItemContent.tsx
// shared image-vs-text item rendering primitive

import { useImageUrlChain } from '~/shared/hooks/useImageUrl'
import type {
  ImageFit,
  ItemTransform,
  MediaPlate,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  getRenderImageRefs,
  hasAnyImageRef,
  type ImageRendition,
  type ItemImageBundle,
} from '~/shared/lib/imageRefs'
import { getTextColor } from '~/shared/lib/color'
import { FramedItemMedia } from '~/shared/board-ui/FramedItemMedia'
import { mediaPlateColor } from '~/shared/board-ui/mediaPlate'
import { OverlayLabelBlock } from '~/shared/board-ui/labelBlocks'
import type { ResolvedLabelDisplay } from '~/shared/board-ui/labelDisplay'
import { TileLayoutShell } from '~/shared/board-ui/TileLayoutShell'

interface ItemContentProps
{
  item: ItemImageBundle & {
    imageUrl?: string
    label?: string
    backgroundColor?: string
    mediaPlate?: MediaPlate
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
  imageRendition?: ImageRendition
  imageLoading?: 'eager' | 'lazy'
}

export const ItemContent = ({
  item,
  variant = 'default',
  label = null,
  frameAspectRatio = 1,
  fit = 'cover',
  imageRendition = 'board',
  imageLoading = 'lazy',
}: ItemContentProps) =>
{
  const bgColor = item.backgroundColor
  const transform = item.transform
  // skip the IDB lookup when the caller already has a direct URL (eg blob:
  // upload preview) — the cached resolution would just return undefined
  const refs = item.imageUrl
    ? { primary: undefined, fallback: undefined }
    : getRenderImageRefs(item, imageRendition)
  // one useImageUrlChain per tile (was two useImageUrl calls) — for a 500-tile
  // board this halves useSyncExternalStore subscriber registrations
  const cachedUrl = useImageUrlChain([
    {
      hash: refs.primary?.ref.hash,
      cloudMediaExternalId: refs.primary?.ref.cloudMediaExternalId,
      variant: refs.primary?.variant,
    },
    {
      hash: refs.fallback?.ref.hash,
      cloudMediaExternalId: refs.fallback?.ref.cloudMediaExternalId,
      variant: refs.fallback?.variant,
    },
  ])
  const imageUrl = item.imageUrl ?? cachedUrl

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
        backgroundColor={mediaPlateColor(item.mediaPlate)}
        loading={imageLoading}
      >
        {!isCaptioned && label && label.placement.mode === 'overlay' && (
          <OverlayLabelBlock display={label} />
        )}
      </FramedItemMedia>
    )

    return isCaptioned ? (
      <TileLayoutShell caption={label}>{imageArea}</TileLayoutShell>
    ) : (
      imageArea
    )
  }

  // image is expected (item carries a hash) but URL hasn't resolved yet.
  // render a flat matte so the text fallback doesn't flash before warm-up
  if (hasAnyImageRef(item))
  {
    const placementMode = label?.placement.mode
    const isCaptioned =
      label &&
      (placementMode === 'captionAbove' || placementMode === 'captionBelow')
    const matte = (
      <div className="relative h-full w-full overflow-hidden bg-[var(--t-bg-surface)]" />
    )

    return isCaptioned ? (
      <TileLayoutShell caption={label}>{matte}</TileLayoutShell>
    ) : (
      matte
    )
  }

  return (
    <div
      className={`flex h-full w-full items-center justify-center overflow-hidden ${
        bgColor ? '' : 'bg-[var(--t-bg-surface)] text-[var(--t-text)]'
      } ${variant === 'compact' ? 'p-0.5' : 'p-1'}`}
      style={
        bgColor
          ? { backgroundColor: bgColor, color: getTextColor(bgColor) }
          : undefined
      }
    >
      <span
        className={`max-h-full overflow-hidden break-words text-center font-semibold [overflow-wrap:anywhere] ${
          variant === 'compact' ? 'text-[10px] leading-tight' : 'text-xs'
        }`}
      >
        {item.label}
      </span>
    </div>
  )
}
