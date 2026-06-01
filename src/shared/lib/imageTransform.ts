// src/shared/lib/imageTransform.ts
// thin re-export plus the browser-only manual-crop CSS builder

import type { CSSProperties } from 'react'

import type { ItemTransform } from '@tierlistbuilder/contracts/workspace/board'
import {
  itemTransformToCropCss,
  resolveManualCropImageSize,
} from '@tierlistbuilder/contracts/workspace/imageTransform'

export {
  clampItemTransform,
  isIdentityTransform,
  isSameItemTransform,
  itemTransformToCropCss,
  resolveManualCropFitZoom,
  resolveManualCropImageSize,
} from '@tierlistbuilder/contracts/workspace/imageTransform'

interface ManualCropImgStyleOptions
{
  intrinsicAspect?: number
  frameAspect: number
  // append willChange: 'transform' for hot-path elements that animate
  willChangeTransform?: boolean
  // preview canvases & rail thumbs disable pointer events on the img so the
  // pan handler on the wrapper still receives drag events through the image
  pointerEventsNone?: boolean
}

// build the absolutely-positioned image style for the cover-frame manual-crop
// path. shared by FramedItemMedia & the image-editor preview canvas
export const buildManualCropImgStyle = (
  transform: ItemTransform,
  {
    intrinsicAspect,
    frameAspect,
    willChangeTransform,
    pointerEventsNone,
  }: ManualCropImgStyleOptions
): CSSProperties =>
{
  const cropSize = resolveManualCropImageSize(
    intrinsicAspect,
    frameAspect,
    transform.rotation
  )
  const cropCss = itemTransformToCropCss(transform)
  const style: CSSProperties = {
    width: `${cropSize.widthPercent}%`,
    height: `${cropSize.heightPercent}%`,
    left: cropCss.left,
    top: cropCss.top,
    transform: cropCss.transform,
    transformOrigin: 'center center',
  }
  if (willChangeTransform) style.willChange = 'transform'
  if (pointerEventsNone) style.pointerEvents = 'none'
  return style
}
