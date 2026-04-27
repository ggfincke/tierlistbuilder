// packages/contracts/workspace/imageMath.ts
// pure image-transform & auto-crop math, importable from both the browser
// (src/) & the convex backend (where browser canvas APIs are unavailable)

import type { ImageFit, ItemTransform } from './board'
import {
  ITEM_TRANSFORM_IDENTITY,
  ITEM_TRANSFORM_LIMITS,
  type ItemRotation,
} from './board'
import { clamp } from '../lib/math'
import { isPositiveFiniteNumber } from '../lib/typeGuards'

// item-transform helpers shared by browser & backend code

export const createIdentityTransform = (): ItemTransform => ({
  ...ITEM_TRANSFORM_IDENTITY,
})

export const clampItemTransform = (transform: ItemTransform): ItemTransform =>
{
  const { zoomMin, zoomMax, offsetMin, offsetMax } = ITEM_TRANSFORM_LIMITS
  return {
    rotation: transform.rotation,
    zoom: clamp(transform.zoom, zoomMin, zoomMax),
    offsetX: clamp(transform.offsetX, offsetMin, offsetMax),
    offsetY: clamp(transform.offsetY, offsetMin, offsetMax),
  }
}

export const isSameItemTransform = (
  a: ItemTransform | undefined,
  b: ItemTransform | undefined
): boolean =>
{
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.rotation === b.rotation &&
    a.zoom === b.zoom &&
    a.offsetX === b.offsetX &&
    a.offsetY === b.offsetY
  )
}

export const isIdentityTransform = (transform: ItemTransform): boolean =>
  isSameItemTransform(transform, ITEM_TRANSFORM_IDENTITY)

interface ManualCropImageSize
{
  widthPercent: number
  heightPercent: number
}

interface ManualCropGeometry
{
  frameWidth: number
  frameHeight: number
  imageWidth: number
  imageHeight: number
  fitWidth: number
  fitHeight: number
}

const validRatio = (value: number | undefined, fallback: number): number =>
  isPositiveFiniteNumber(value) ? value : fallback

const resolveManualCropGeometry = (
  imageAspectRatio: number | undefined,
  frameAspectRatio: number,
  rotation: ItemRotation
): ManualCropGeometry =>
{
  const frameRatio = validRatio(frameAspectRatio, 1)
  const imageRatio = validRatio(imageAspectRatio, frameRatio)
  const frameWidth = frameRatio
  const frameHeight = 1
  const imageWidth = imageRatio
  const imageHeight = 1
  const rotated = rotation === 90 || rotation === 270

  return {
    frameWidth,
    frameHeight,
    imageWidth,
    imageHeight,
    fitWidth: rotated ? imageHeight : imageWidth,
    fitHeight: rotated ? imageWidth : imageHeight,
  }
}

export const resolveManualCropImageSize = (
  imageAspectRatio: number | undefined,
  frameAspectRatio: number,
  rotation: ItemRotation
): ManualCropImageSize =>
{
  const {
    frameWidth,
    frameHeight,
    imageWidth,
    imageHeight,
    fitWidth,
    fitHeight,
  } = resolveManualCropGeometry(imageAspectRatio, frameAspectRatio, rotation)
  const scale = Math.max(frameWidth / fitWidth, frameHeight / fitHeight)
  const domWidth = imageWidth * scale
  const domHeight = imageHeight * scale

  return {
    widthPercent: (domWidth / frameWidth) * 100,
    heightPercent: (domHeight / frameHeight) * 100,
  }
}

export const resolveManualCropFitZoom = (
  imageAspectRatio: number | undefined,
  frameAspectRatio: number,
  rotation: ItemRotation,
  fit: ImageFit
): number =>
{
  if (fit === 'cover') return 1
  const { frameWidth, frameHeight, fitWidth, fitHeight } =
    resolveManualCropGeometry(imageAspectRatio, frameAspectRatio, rotation)
  const coverScale = Math.max(frameWidth / fitWidth, frameHeight / fitHeight)
  const containScale = Math.min(frameWidth / fitWidth, frameHeight / fitHeight)
  return containScale / coverScale
}

export const itemTransformToCropCss = (
  transform: ItemTransform
): { left: string; top: string; transform: string } => ({
  left: `${(50 + transform.offsetX * 100).toFixed(4)}%`,
  top: `${(50 + transform.offsetY * 100).toFixed(4)}%`,
  transform: `translate(-50%, -50%) scale(${transform.zoom}) rotate(${transform.rotation}deg)`,
})

// aspect-ratio presets & matching math — pure helpers shared between the
// modal/picker UI & the seed script

// relative difference within this fraction treats two ratios as equal; tuned
// to absorb rounding & codec variance (e.g. 1000x1500 vs 1001x1500) without
// letting obviously different ratios (4:3 vs 1:1) collapse into one bucket
export const ASPECT_RATIO_TOLERANCE = 0.02

export interface AspectRatioPreset
{
  label: string
  width: number
  height: number
  value: number
}

const buildPreset = (width: number, height: number): AspectRatioPreset => ({
  label: `${width}:${height}`,
  width,
  height,
  value: width / height,
})

export const ASPECT_RATIO_PRESETS: readonly AspectRatioPreset[] = [
  buildPreset(1, 1),
  buildPreset(2, 3),
  buildPreset(3, 4),
  buildPreset(3, 2),
  buildPreset(4, 3),
  buildPreset(16, 9),
  buildPreset(9, 16),
]

// two ratios are considered equal when their relative difference is within tol
export const ratiosMatch = (
  a: number,
  b: number,
  tol = ASPECT_RATIO_TOLERANCE
): boolean =>
{
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0)
  {
    return false
  }
  const max = Math.max(a, b)
  return Math.abs(a - b) / max <= tol
}

interface AspectRatioValueBucket<T>
{
  representative: number
  count: number
  ratios: number[]
  values: T[]
}

const medianOf = (values: readonly number[]): number =>
{
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

// group values by ratio tolerance; each bucket's representative is the median
// of its member ratios. returned sorted by bucket size desc
export const bucketValuesByAspectRatio = <T>(
  values: readonly T[],
  getRatio: (value: T) => number | null | undefined,
  tol = ASPECT_RATIO_TOLERANCE
): AspectRatioValueBucket<T>[] =>
{
  const buckets: { ratios: number[]; values: T[] }[] = []
  for (const value of values)
  {
    const ratio = getRatio(value)
    if (!isPositiveFiniteNumber(ratio)) continue
    let placed = false
    for (const bucket of buckets)
    {
      if (ratiosMatch(ratio, bucket.ratios[0], tol))
      {
        bucket.ratios.push(ratio)
        bucket.values.push(value)
        placed = true
        break
      }
    }
    if (!placed) buckets.push({ ratios: [ratio], values: [value] })
  }
  return buckets
    .map((bucket) => ({
      representative: medianOf(bucket.ratios),
      count: bucket.ratios.length,
      ratios: bucket.ratios,
      values: bucket.values,
    }))
    .sort((a, b) => b.count - a.count)
}

export const majorityAspectRatio = (
  ratios: readonly number[],
  tol = ASPECT_RATIO_TOLERANCE
): number | null =>
{
  const buckets = bucketValuesByAspectRatio(ratios, (ratio) => ratio, tol)
  return buckets[0]?.representative ?? null
}

// snap a ratio to the nearest preset by relative distance, so the auto
// suggestion is always a clean w:h pair (1:1, 2:3, 3:4, ...) rather than the
// raw bucket median (e.g. 0.6671 -> 2:3)
export const snapToNearestPreset = (value: number): number =>
{
  if (!isPositiveFiniteNumber(value)) return value
  let best = ASPECT_RATIO_PRESETS[0].value
  let bestDistance = Infinity
  for (const preset of ASPECT_RATIO_PRESETS)
  {
    const distance =
      Math.abs(preset.value - value) / Math.max(preset.value, value)
    if (distance < bestDistance)
    {
      bestDistance = distance
      best = preset.value
    }
  }
  return best
}

export const findMatchingPreset = (
  value: number,
  tol = ASPECT_RATIO_TOLERANCE
): AspectRatioPreset | undefined =>
  ASPECT_RATIO_PRESETS.find((preset) => ratiosMatch(preset.value, value, tol))

// auto-crop math: detect content bbox from raw RGBA pixel data, then translate
// it into an ItemTransform that frames the bbox in the configured cell ratio

// long-edge cap for the analysis canvas; bbox is normalized so detection
// resolution is decoupled from natural pixel dimensions
export const AUTO_CROP_ANALYSIS_MAX_SIZE = 256

// alpha threshold (0..255) for pixels considered "content" in alpha-based
// detection. anti-aliased edges fade through low alpha values, so a tiny
// floor avoids pulling the bbox out to ghost pixels
const ALPHA_CONTENT_THRESHOLD = 16

// alpha threshold above which a pixel is treated as opaque "core" content;
// soft fringes (drop shadows, glows, AA) sit between SOFT & SOLID
const ALPHA_SOLID_THRESHOLD = 192

// how far the soft bbox may extend past the solid bbox (per side, as a
// fraction of image dim) before we treat that side as a soft tail &
// snap to the solid edge
const ALPHA_SOFT_EDGE_MAX_FRACTION = 0.02

// require the solid core to occupy this fraction of the soft bbox area
// before we consider trimming; otherwise the "soft tail" is the actual
// subject (heavy translucency, faint art) & shouldn't be cropped away
const ALPHA_SOLID_AREA_MIN_RATIO = 0.5

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

export interface AutoCropPixelData
{
  data: Uint8Array | Uint8ClampedArray
  width: number
  height: number
}

interface PixelBBox
{
  minX: number
  minY: number
  maxX: number
  maxY: number
}

// raw scan result, cached per image hash. holds both the soft (low-alpha or
// color-cluster) & the solid (high-alpha) bbox so the trim-shadows toggle
// can pick a final bbox w/o re-decoding & re-scanning the image
export interface AutoCropScan
{
  soft: PixelBBox
  // populated only in alpha mode; null in corner-color mode (no solid pass)
  solid: PixelBBox | null
  width: number
  height: number
}

// resize an analysis-canvas dimension pair so the longest edge is `maxSize`
// while preserving aspect ratio. callers (browser canvas, sharp.resize) feed
// the result back into their own resampler
export const getAutoCropAnalysisDimensions = (
  width: number,
  height: number,
  maxSize: number = AUTO_CROP_ANALYSIS_MAX_SIZE
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

export const scanAutoCropPixels = (
  pixels: AutoCropPixelData
): AutoCropScan | null =>
  hasMeaningfulAlpha(pixels) ? scanAlpha(pixels) : scanCornerColor(pixels)

const hasMeaningfulAlpha = (pixels: AutoCropPixelData): boolean =>
{
  const { data, width, height } = pixels
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

// cache soft & solid bboxes so trim-shadows toggles do not re-scan
const scanAlpha = (pixels: AutoCropPixelData): AutoCropScan | null =>
{
  const { data, width, height } = pixels
  let softMinX = width
  let softMinY = height
  let softMaxX = -1
  let softMaxY = -1
  let solidMinX = width
  let solidMinY = height
  let solidMaxX = -1
  let solidMaxY = -1
  for (let y = 0; y < height; y++)
  {
    let row = (y * width) << 2
    for (let x = 0; x < width; x++, row += 4)
    {
      const a = data[row + 3]
      if (a >= ALPHA_CONTENT_THRESHOLD)
      {
        if (x < softMinX) softMinX = x
        if (x > softMaxX) softMaxX = x
        if (y < softMinY) softMinY = y
        if (y > softMaxY) softMaxY = y
        if (a >= ALPHA_SOLID_THRESHOLD)
        {
          if (x < solidMinX) solidMinX = x
          if (x > solidMaxX) solidMaxX = x
          if (y < solidMinY) solidMinY = y
          if (y > solidMaxY) solidMaxY = y
        }
      }
    }
  }
  if (softMaxX < 0) return null
  return {
    soft: {
      minX: softMinX,
      minY: softMinY,
      maxX: softMaxX,
      maxY: softMaxY,
    },
    solid:
      solidMaxX < 0
        ? null
        : {
            minX: solidMinX,
            minY: solidMinY,
            maxX: solidMaxX,
            maxY: solidMaxY,
          },
    width,
    height,
  }
}

const scanCornerColor = (pixels: AutoCropPixelData): AutoCropScan | null =>
{
  const { data, width, height } = pixels
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
  // their average wins. otherwise fall back to the median of all 4
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
  return {
    soft: { minX, minY, maxX, maxY },
    solid: null,
    width,
    height,
  }
}

// derive the final bbox from a scan & the trim-shadows toggle. trim falls
// back to the soft bbox when the solid core is absent or too small a
// fraction of the soft bbox to be a reliable trim anchor
export const pickAutoCropBBox = (
  scan: AutoCropScan,
  trimSoftShadows: boolean
): AutoCropBBox | null =>
{
  const pixel =
    trimSoftShadows &&
    scan.solid &&
    shouldTrimSoftShadows(scan.soft, scan.solid)
      ? trimSoftShadowBBox(scan.soft, scan.solid, scan.width, scan.height)
      : scan.soft
  const bbox = normalizeBBox(
    pixel.minX,
    pixel.minY,
    pixel.maxX,
    pixel.maxY,
    scan.width,
    scan.height
  )
  const area = (bbox.right - bbox.left) * (bbox.bottom - bbox.top)
  if (area < MIN_BBOX_AREA_FRACTION) return null
  return bbox
}

const shouldTrimSoftShadows = (soft: PixelBBox, solid: PixelBBox): boolean =>
  getPixelBBoxArea(solid) / getPixelBBoxArea(soft) >= ALPHA_SOLID_AREA_MIN_RATIO

const getPixelBBoxArea = (bbox: PixelBBox): number =>
  (bbox.maxX - bbox.minX + 1) * (bbox.maxY - bbox.minY + 1)

// snap the soft bbox to the solid bbox per side, but only on sides where the
// soft tail extends meaningfully past the solid core. preserves short fringes
// (anti-aliasing, faint outlines) on sides where the difference is small
const trimSoftShadowBBox = (
  soft: PixelBBox,
  solid: PixelBBox,
  width: number,
  height: number
): PixelBBox =>
{
  const maxSoftX = width * ALPHA_SOFT_EDGE_MAX_FRACTION
  const maxSoftY = height * ALPHA_SOFT_EDGE_MAX_FRACTION
  return {
    minX: solid.minX - soft.minX > maxSoftX ? solid.minX : soft.minX,
    minY: solid.minY - soft.minY > maxSoftY ? solid.minY : soft.minY,
    maxX: soft.maxX - solid.maxX > maxSoftX ? solid.maxX : soft.maxX,
    maxY: soft.maxY - solid.maxY > maxSoftY ? solid.maxY : soft.maxY,
  }
}

interface RGB
{
  r: number
  g: number
  b: number
}

const sampleCorner = (
  data: Uint8Array | Uint8ClampedArray,
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
  const clusterThresholdSq = COLOR_CONTENT_DISTANCE_SQ
  let best: RGB[] = []
  for (const seed of samples)
  {
    const cluster = samples.filter(
      (s) => squaredDistance(s, seed) <= clusterThresholdSq
    )
    if (cluster.length > best.length) best = cluster
  }
  if (best.length < 3) return medianColor(samples)
  return averageColor(best)
}

const averageColor = (samples: readonly RGB[]): RGB =>
{
  let r = 0
  let g = 0
  let b = 0
  for (const s of samples)
  {
    r += s.r
    g += s.g
    b += s.b
  }
  return { r: r / samples.length, g: g / samples.length, b: b / samples.length }
}

const medianColor = (samples: readonly RGB[]): RGB => ({
  r: medianOf(samples.map((s) => s.r)),
  g: medianOf(samples.map((s) => s.g)),
  b: medianOf(samples.map((s) => s.b)),
})

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

// translate a detected bbox into the ItemTransform that keeps all detected
// content visible in the cell. preserves rotation; offsets/zoom are computed
// in screen coords so 90/270 deg items still center correctly
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
    // the frame, scaled by frameRatio because frame H != frame W in pixels
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
    default:
    {
      const exhaustive: never = rotation
      return exhaustive
    }
  }
}
