// src/shared/lib/autoCrop.ts
// detect the bbox of an image's actual content (alpha or color based) &
// translate it into an ItemTransform that frames the bbox in the cell

import type {
  ItemRotation,
  ItemTransform,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import { ITEM_TRANSFORM_IDENTITY } from '@tierlistbuilder/contracts/workspace/board'

import {
  clampItemTransform,
  isSameItemTransform,
  resolveManualCropImageSize,
} from './imageTransform'
import { logger } from './logger'
import { clamp } from './math'

// long-edge cap for the analysis canvas; bbox is normalized so detection
// resolution is decoupled from natural pixel dimensions
const ANALYSIS_MAX_SIZE = 256

// alpha threshold (0..255) for pixels considered "content" in alpha-based
// detection. anti-aliased edges fade through low alpha values, so a tiny
// floor avoids pulling the bbox out to ghost pixels
const ALPHA_CONTENT_THRESHOLD = 16

// fraction of total pixels w/ alpha < threshold required to switch from
// color-based to alpha-based detection. images w/ a few stray transparent
// pixels (jpeg-to-png conversions, lossy edges) shouldn't fool the picker
const ALPHA_PRESENCE_FRACTION = 0.005

// sample size (in px on the analysis canvas) for each corner patch when
// inferring the background color of an opaque image
const CORNER_PATCH_SIZE = 5

// squared-RGB Euclidean distance threshold for a pixel to count as content
// vs background in color-based detection. tuned for the common case of a
// near-uniform background w/ moderate jpeg compression noise
const COLOR_CONTENT_DISTANCE_SQ = 32 * 32

// minimum bbox area (as a fraction of image area) for the result to be
// considered useful; falls back to null below this so bulk crop doesn't
// blow up zoom on a near-empty image
const MIN_BBOX_AREA_FRACTION = 0.01

// bbox coverage above this threshold means detection found no useful margin
// to crop away, so the button should behave as a no-op
const FULL_IMAGE_EDGE_FRACTION = 0.995

// fraction of image dimensions added on each side as breathing room.
// applied AFTER content detection but BEFORE the transform math so the
// resulting zoom naturally leaves a small margin around the content
const DEFAULT_PADDING_FRACTION = 0.01

export interface AutoCropBBox
{
  // all values in [0, 1] image-natural coordinates (origin top-left, before
  // any rotation transform is applied)
  left: number
  top: number
  right: number
  bottom: number
}

interface BBoxToTransformParams
{
  // natural image w/h ratio; absent -> falls back to frame ratio
  imageAspectRatio: number | undefined
  // cell w/h ratio
  boardAspectRatio: number
  // current per-item rotation; preserved through the transform
  rotation: ItemRotation
  // breathing room on each side, as fraction of image dims
  paddingFraction?: number
}

// hash -> cached result. null marks "detection ran but no useful crop" so
// repeat calls short-circuit
const bboxCache = new Map<string, AutoCropBBox | null>()
const bboxCacheListeners = new Set<() => void>()
let bboxCacheVersion = 0

const emitBBoxCacheChange = (): void =>
{
  bboxCacheVersion += 1
  for (const listener of bboxCacheListeners) listener()
}

const getAnalysisDimensions = (
  width: number,
  height: number,
  maxSize: number
): { width: number; height: number } =>
{
  if (width <= maxSize && height <= maxSize) return { width, height }
  if (width >= height)
  {
    return {
      width: maxSize,
      height: Math.max(1, Math.round((height / width) * maxSize)),
    }
  }
  return {
    width: Math.max(1, Math.round((width / height) * maxSize)),
    height: maxSize,
  }
}

export const clearAutoCropCache = (): void =>
{
  bboxCache.clear()
  emitBBoxCacheChange()
}

export const subscribeAutoCropCache = (listener: () => void): (() => void) =>
{
  bboxCacheListeners.add(listener)
  return () => bboxCacheListeners.delete(listener)
}

export const getAutoCropCacheVersion = (): number => bboxCacheVersion

export const getAutoCropHash = (item: TierItem): string | undefined =>
  item.sourceImageRef?.hash ?? item.imageRef?.hash

export const getCachedBBox = (
  hash: string | undefined
): AutoCropBBox | null | undefined => (hash ? bboxCache.get(hash) : undefined)

export const resolveAutoCropTransform = (
  item: TierItem,
  bbox: AutoCropBBox,
  boardAspectRatio: number,
  rotation: ItemRotation = item.transform?.rotation ?? 0
): ItemTransform =>
  bboxToItemTransform(bbox, {
    imageAspectRatio: item.aspectRatio,
    boardAspectRatio,
    rotation,
  })

export const areCachedAutoCropsApplied = (
  items: readonly TierItem[],
  boardAspectRatio: number
): boolean =>
{
  let hasDetectedCrop = false
  for (const item of items)
  {
    const hash = getAutoCropHash(item)
    if (!hash) continue
    const bbox = getCachedBBox(hash)
    if (bbox === undefined) return false
    if (bbox === null) continue
    hasDetectedCrop = true
    if (
      !isSameItemTransform(
        item.transform,
        resolveAutoCropTransform(item, bbox, boardAspectRatio)
      )
    )
    {
      return false
    }
  }
  return hasDetectedCrop
}

// detect content bbox; returns null when no useful crop exists (full image
// or detection failure). cached by hash so bulk runs skip repeat decode
export const detectContentBBox = async (
  blob: Blob,
  hash?: string
): Promise<AutoCropBBox | null> =>
{
  if (hash && bboxCache.has(hash))
  {
    return bboxCache.get(hash) ?? null
  }

  let result: AutoCropBBox | null = null
  try
  {
    result = await runDetection(blob)
  }
  catch (error)
  {
    logger.warn('autoCrop', 'detection failed', error)
    result = null
  }

  if (hash)
  {
    bboxCache.set(hash, result)
    emitBBoxCacheChange()
  }
  return result
}

const runDetection = async (blob: Blob): Promise<AutoCropBBox | null> =>
{
  const bitmap = await createImageBitmap(blob)
  try
  {
    const { width: targetW, height: targetH } = getAnalysisDimensions(
      bitmap.width,
      bitmap.height,
      ANALYSIS_MAX_SIZE
    )
    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, targetW, targetH)
    const imageData = ctx.getImageData(0, 0, targetW, targetH)
    const bbox = scanBBox(imageData)
    if (!bbox) return null
    const area = (bbox.right - bbox.left) * (bbox.bottom - bbox.top)
    if (area < MIN_BBOX_AREA_FRACTION) return null
    if (isFullImageBBox(bbox)) return null
    return bbox
  }
  finally
  {
    // free decoded bitmap immediately; createImageBitmap retains GPU memory
    bitmap.close()
  }
}

const isFullImageBBox = (bbox: AutoCropBBox): boolean =>
  bbox.left <= 1 - FULL_IMAGE_EDGE_FRACTION &&
  bbox.top <= 1 - FULL_IMAGE_EDGE_FRACTION &&
  bbox.right >= FULL_IMAGE_EDGE_FRACTION &&
  bbox.bottom >= FULL_IMAGE_EDGE_FRACTION

const scanBBox = (imageData: ImageData): AutoCropBBox | null =>
{
  const useAlpha = hasMeaningfulAlpha(imageData)
  return useAlpha ? scanByAlpha(imageData) : scanByCornerColor(imageData)
}

const hasMeaningfulAlpha = (imageData: ImageData): boolean =>
{
  const { data, width, height } = imageData
  const total = width * height
  let transparent = 0
  // sample on a sparse stride (every 4th pixel) — meaningful transparency
  // covers large regions, so we don't need full coverage to classify
  for (let i = 3; i < data.length; i += 16)
  {
    if (data[i] < ALPHA_CONTENT_THRESHOLD)
    {
      transparent++
      if (transparent / (total / 4) >= ALPHA_PRESENCE_FRACTION)
      {
        return true
      }
    }
  }
  return false
}

const scanByAlpha = (imageData: ImageData): AutoCropBBox | null =>
{
  const { data, width, height } = imageData
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++)
  {
    let row = (y * width) << 2
    for (let x = 0; x < width; x++, row += 4)
    {
      if (data[row + 3] >= ALPHA_CONTENT_THRESHOLD)
      {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  return normalizeBBox(minX, minY, maxX, maxY, width, height)
}

const scanByCornerColor = (imageData: ImageData): AutoCropBBox | null =>
{
  const { data, width, height } = imageData
  const corners = [
    sampleCorner(data, width, 0, 0),
    sampleCorner(data, width, width - CORNER_PATCH_SIZE, 0),
    sampleCorner(data, width, 0, height - CORNER_PATCH_SIZE),
    sampleCorner(
      data,
      width,
      width - CORNER_PATCH_SIZE,
      height - CORNER_PATCH_SIZE
    ),
  ]
  // pick the modal background by clustering the 4 corners; if 3+ agree,
  // their average wins. otherwise fall back to the median of all 4 to
  // resist a single odd corner (e.g. a watermark in one corner)
  const bg = pickBackgroundColor(corners)
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++)
  {
    let row = (y * width) << 2
    for (let x = 0; x < width; x++, row += 4)
    {
      const dr = data[row] - bg.r
      const dg = data[row + 1] - bg.g
      const db = data[row + 2] - bg.b
      if (dr * dr + dg * dg + db * db > COLOR_CONTENT_DISTANCE_SQ)
      {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  return normalizeBBox(minX, minY, maxX, maxY, width, height)
}

interface RGB
{
  r: number
  g: number
  b: number
}

const sampleCorner = (
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number
): RGB =>
{
  let r = 0
  let g = 0
  let b = 0
  let count = 0
  for (let dy = 0; dy < CORNER_PATCH_SIZE; dy++)
  {
    for (let dx = 0; dx < CORNER_PATCH_SIZE; dx++)
    {
      const idx = ((y0 + dy) * width + (x0 + dx)) << 2
      r += data[idx]
      g += data[idx + 1]
      b += data[idx + 2]
      count++
    }
  }
  return { r: r / count, g: g / count, b: b / count }
}

const pickBackgroundColor = (samples: readonly RGB[]): RGB =>
{
  // find the largest cluster of mutually-similar samples, then average
  const clusterThresholdSq = COLOR_CONTENT_DISTANCE_SQ
  let best: RGB[] = []
  for (const seed of samples)
  {
    const cluster = samples.filter(
      (s) => squaredDistance(s, seed) <= clusterThresholdSq
    )
    if (cluster.length > best.length) best = cluster
  }
  if (best.length === 0) best = [...samples]
  let r = 0
  let g = 0
  let b = 0
  for (const s of best)
  {
    r += s.r
    g += s.g
    b += s.b
  }
  return { r: r / best.length, g: g / best.length, b: b / best.length }
}

const squaredDistance = (a: RGB, b: RGB): number =>
{
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return dr * dr + dg * dg + db * db
}

const normalizeBBox = (
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  width: number,
  height: number
): AutoCropBBox => ({
  left: minX / width,
  top: minY / height,
  right: (maxX + 1) / width,
  bottom: (maxY + 1) / height,
})

// translate a detected bbox into the ItemTransform that keeps all detected
// content visible in the cell. preserves rotation; offsets/zoom are computed
// in screen coords so 90/270° items still center correctly
export const bboxToItemTransform = (
  bbox: AutoCropBBox,
  params: BBoxToTransformParams
): ItemTransform =>
{
  const padding = params.paddingFraction ?? DEFAULT_PADDING_FRACTION
  const padded = padBBox(bbox, padding)
  const bcx = (padded.left + padded.right) / 2
  const bcy = (padded.top + padded.bottom) / 2
  const bw = padded.right - padded.left
  const bh = padded.bottom - padded.top

  const frameRatio = params.boardAspectRatio > 0 ? params.boardAspectRatio : 1
  // wp/hp are the un-rotated element's CSS box as fractions of frame W/H —
  // exactly what resolveManualCropImageSize emits at zoom=1, cover-fit
  const cropSize = resolveManualCropImageSize(
    params.imageAspectRatio,
    frameRatio,
    params.rotation
  )
  const wp = cropSize.widthPercent / 100
  const hp = cropSize.heightPercent / 100

  // visual extent of the bbox (after CSS rotation) as fractions of the
  // frame's W/H. for 90/270, the un-rotated W maps to frame H (& vice
  // versa) — pixel widths convert through frameRatio
  const { visualW, visualH } = visualBBoxExtent(
    bw,
    bh,
    wp,
    hp,
    params.rotation,
    frameRatio
  )

  if (visualW <= 0 || visualH <= 0)
  {
    return clampItemTransform({
      ...ITEM_TRANSFORM_IDENTITY,
      rotation: params.rotation,
    })
  }

  const zoom = Math.min(1 / visualW, 1 / visualH)

  const { offsetX, offsetY } = computeOffsets(
    bcx,
    bcy,
    wp,
    hp,
    params.rotation,
    frameRatio,
    zoom
  )

  return clampItemTransform({
    rotation: params.rotation,
    zoom,
    offsetX,
    offsetY,
  })
}

const padBBox = (bbox: AutoCropBBox, padding: number): AutoCropBBox =>
{
  if (padding <= 0) return bbox
  return {
    left: clamp(bbox.left - padding, 0, 1),
    top: clamp(bbox.top - padding, 0, 1),
    right: clamp(bbox.right + padding, 0, 1),
    bottom: clamp(bbox.bottom + padding, 0, 1),
  }
}

const visualBBoxExtent = (
  bw: number,
  bh: number,
  wp: number,
  hp: number,
  rotation: ItemRotation,
  frameRatio: number
): { visualW: number; visualH: number } =>
{
  if (rotation === 90 || rotation === 270)
  {
    // un-rotated horizontal extent (frame-W-fraction) becomes vertical on
    // the frame, scaled by frameRatio because frame H ≠ frame W in pixels
    return {
      visualW: (bh * hp) / frameRatio,
      visualH: bw * wp * frameRatio,
    }
  }
  return { visualW: bw * wp, visualH: bh * hp }
}

const computeOffsets = (
  bcx: number,
  bcy: number,
  wp: number,
  hp: number,
  rotation: ItemRotation,
  frameRatio: number,
  zoom: number
): { offsetX: number; offsetY: number } =>
{
  const cx = (bcx - 0.5) * wp
  const cy = (bcy - 0.5) * hp
  // rotate the element-local center vector by the CSS clockwise rotation,
  // then negate (we want the bbox center to land on the frame center)
  switch (rotation)
  {
    case 0:
      return { offsetX: -cx * zoom, offsetY: -cy * zoom }
    case 90:
      return {
        offsetX: (cy * zoom) / frameRatio,
        offsetY: -cx * zoom * frameRatio,
      }
    case 180:
      return { offsetX: cx * zoom, offsetY: cy * zoom }
    case 270:
      return {
        offsetX: -(cy * zoom) / frameRatio,
        offsetY: cx * zoom * frameRatio,
      }
  }
}
