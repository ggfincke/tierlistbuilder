// src/features/marketplace/model/coverFramingPlacement.ts
// shared math for placing a cover image inside a surface container so the
// stored frame fills the container w/ object-cover semantics

import {
  FULL_COVER_FRAME,
  type CoverFrame,
} from '@tierlistbuilder/contracts/marketplace/template'

export interface CoverFramePlacement
{
  width: number
  height: number
  left: number
  top: number
}

interface ComputeInput
{
  frame: CoverFrame | null
  containerWidth: number
  containerHeight: number
  sourceWidth: number
  sourceHeight: number
}

const isPositiveFinite = (n: number): boolean => Number.isFinite(n) && n > 0

// place the source image so the frame region object-covers the container.
// scale = max axis ratio so the frame fills the container; the image is then
// translated so the frame's center sits at the container's center
export const computeFramedPlacement = ({
  frame,
  containerWidth,
  containerHeight,
  sourceWidth,
  sourceHeight,
}: ComputeInput): CoverFramePlacement | null =>
{
  if (
    !isPositiveFinite(containerWidth) ||
    !isPositiveFinite(containerHeight) ||
    !isPositiveFinite(sourceWidth) ||
    !isPositiveFinite(sourceHeight)
  )
  {
    return null
  }
  const f = frame ?? FULL_COVER_FRAME
  const frameWpx = f.width * sourceWidth
  const frameHpx = f.height * sourceHeight
  if (!isPositiveFinite(frameWpx) || !isPositiveFinite(frameHpx)) return null
  const scale = Math.max(containerWidth / frameWpx, containerHeight / frameHpx)
  const imgW = sourceWidth * scale
  const imgH = sourceHeight * scale
  const frameX = f.x * sourceWidth
  const frameY = f.y * sourceHeight
  const left = (containerWidth - frameWpx * scale) / 2 - frameX * scale
  const top = (containerHeight - frameHpx * scale) / 2 - frameY * scale
  return { width: imgW, height: imgH, left, top }
}
