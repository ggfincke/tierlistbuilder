// src/shared/board-ui/coverTileRender.ts
// resolve a cover tile's plate/fit/padding the way the board renders the item —
// shared by the marketplace & library mosaics so both surfaces frame alike

import type {
  BoardAutoPlateSettings,
  ImageFit,
  MediaPlate,
} from '@tierlistbuilder/contracts/workspace/board'
import { getEffectiveImageFit, getEffectiveImagePadding } from './aspectRatio'
import { resolveItemBackdrop } from './mediaPlate'

interface CoverTileRenderItem
{
  imageFit?: ImageFit | null
  imagePadding?: number | null
  backgroundColor?: string | null
  mediaPlate?: MediaPlate | null
}

interface CoverTileRenderContext
{
  autoPlate?: BoardAutoPlateSettings | null
  defaultImageFit?: ImageFit | null
  defaultImagePadding?: number | null
}

export interface CoverTileRender
{
  fit: ImageFit
  padding: number
  backgroundColor: string | undefined
}

export const resolveCoverTileRender = (
  item: CoverTileRenderItem,
  ctx: CoverTileRenderContext
): CoverTileRender =>
{
  const backgroundColor = resolveItemBackdrop(item, ctx.autoPlate)
  // a plate means the image floats on it (logos) — contain so it's shown whole,
  // never cropped, regardless of the cell aspect
  const fit: ImageFit =
    backgroundColor != null
      ? 'contain'
      : getEffectiveImageFit(
          { imageFit: item.imageFit ?? undefined },
          ctx.defaultImageFit ?? undefined
        )
  const padding = getEffectiveImagePadding(
    { imagePadding: item.imagePadding ?? undefined },
    ctx.defaultImagePadding ?? undefined,
    backgroundColor != null
  )
  return { fit, padding, backgroundColor }
}
