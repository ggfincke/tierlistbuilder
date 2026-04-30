// scripts/lib/autoCropDetect.ts
// node-side auto-crop detector — wraps sharp around the shared scan/transform
// math so the seed script can pre-bake aspectRatio + transform into items

import sharp from 'sharp'

import {
  AUTO_CROP_ANALYSIS_MAX_SIZE,
  bboxToItemTransform,
  getAutoCropAnalysisDimensions,
  pickAutoCropBBox,
  scanAutoCropPixels,
  type AutoCropBBox,
} from '@tierlistbuilder/contracts/workspace/imageMath'
import type { ItemTransform } from '@tierlistbuilder/contracts/workspace/board'

export interface ImageProbe
{
  // natural pixel dimensions captured before resampling
  naturalWidth: number
  naturalHeight: number
  aspectRatio: number
  bbox: AutoCropBBox | null
}

// decode bytes once, resize to the analysis canvas, pull raw RGBA, run the
// shared scan + bbox pick. returns natural dimensions even when detection
// finds no bbox so callers can still set per-item aspectRatio
export const probeImage = async (bytes: Uint8Array): Promise<ImageProbe> =>
{
  const image = sharp(bytes)
  const metadata = await image.metadata()
  const naturalWidth = metadata.width ?? 0
  const naturalHeight = metadata.height ?? 0
  if (naturalWidth <= 0 || naturalHeight <= 0)
  {
    throw new Error('image has no usable dimensions')
  }

  const { width: targetW, height: targetH } = getAutoCropAnalysisDimensions(
    naturalWidth,
    naturalHeight,
    AUTO_CROP_ANALYSIS_MAX_SIZE
  )

  // ensureAlpha forces 4-channel RGBA output even for jpegs; raw().toBuffer
  // gives us a Uint8 buffer in the same row-major layout as ImageData.data
  const { data, info } = await image
    .clone()
    .resize(targetW, targetH, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const scan = scanAutoCropPixels({
    data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
  })

  const bbox = scan ? pickAutoCropBBox(scan, true) : null

  return {
    naturalWidth,
    naturalHeight,
    aspectRatio: naturalWidth / naturalHeight,
    bbox,
  }
}

export interface ResolveAutoCropTransformParams
{
  imageAspectRatio: number
  bbox: AutoCropBBox
  boardAspectRatio: number
}

export const resolveSeedAutoCropTransform = ({
  imageAspectRatio,
  bbox,
  boardAspectRatio,
}: ResolveAutoCropTransformParams): ItemTransform =>
  bboxToItemTransform(bbox, {
    imageAspectRatio,
    boardAspectRatio,
    rotation: 0,
  })
