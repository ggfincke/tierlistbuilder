// src/shared/board-ui/cover/coverTileRender.ts
// resolve cover tile plate/fit/padding for marketplace & library mosaics

import type {
  BoardAutoPlateSettings,
  ImageFit,
  MediaPlate,
} from '@tierlistbuilder/contracts/workspace/board'
import { getEffectiveImageFit, getEffectiveImagePadding } from '../aspectRatio'
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
  // plate-backed images use contain so logos render whole
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
