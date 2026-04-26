// src/shared/lib/imageTransform.ts
// shared per-item manual crop transform helpers

import type {
  ImageFit,
  ItemTransform,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  ITEM_TRANSFORM_IDENTITY,
  ITEM_TRANSFORM_LIMITS,
} from '@tierlistbuilder/contracts/workspace/board'
import { clamp } from './math'
import { isPositiveFiniteNumber } from './typeGuards'

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

// create a fresh value so item edits never share object references
export const createIdentityTransform = (): ItemTransform => ({
  ...ITEM_TRANSFORM_IDENTITY,
})

// clamp untrusted values into contract limits before save/sync
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

// compare flat transform values w/o relying on object identity
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

// check whether a transform renders as the default crop
export const isIdentityTransform = (transform: ItemTransform): boolean =>
  isSameItemTransform(transform, ITEM_TRANSFORM_IDENTITY)

const validRatio = (value: number | undefined, fallback: number): number =>
  isPositiveFiniteNumber(value) ? value : fallback

const resolveManualCropGeometry = (
  imageAspectRatio: number | undefined,
  frameAspectRatio: number,
  rotation: ItemTransform['rotation']
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
  rotation: ItemTransform['rotation']
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
  rotation: ItemTransform['rotation'],
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
