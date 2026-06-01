// packages/contracts/workspace/imageTransform.ts
// item-transform math mirrored by scripts/seed_pipeline/seed_pipeline/crop.py

import type { ImageFit, ItemTransform } from './board'
import {
  ITEM_TRANSFORM_IDENTITY,
  ITEM_TRANSFORM_LIMITS,
  type ItemRotation,
} from './board'
import { clamp } from '../lib/math'
import { isPositiveFiniteNumber } from '../lib/typeGuards'

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
