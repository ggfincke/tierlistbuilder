// src/features/marketplace/model/cover/coverFrameArea.ts
// convert cropper percentage areas to stored cover-frame fractions

import type { CoverFrame } from '@tierlistbuilder/contracts/marketplace/template'

export interface CropPercentageArea
{
  x: number
  y: number
  width: number
  height: number
}

// area is in % of the source image. when the cropper is letterboxed these
// values may sit outside [0, 100]; CoverFrame accepts that same relaxed range
export const cropAreaToFrame = (area: CropPercentageArea): CoverFrame => ({
  x: area.x / 100,
  y: area.y / 100,
  width: area.width / 100,
  height: area.height / 100,
})

export const frameToCropArea = (
  frame: CoverFrame | null
): CropPercentageArea | undefined =>
  frame
    ? {
        x: frame.x * 100,
        y: frame.y * 100,
        width: frame.width * 100,
        height: frame.height * 100,
      }
    : undefined
