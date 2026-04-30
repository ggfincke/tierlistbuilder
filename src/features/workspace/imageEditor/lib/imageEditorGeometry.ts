// src/features/workspace/imageEditor/lib/imageEditorGeometry.ts
// geometry, transform, & DOM-target helpers shared by image-editor UI modules

import type {
  ImageFit,
  ItemRotation,
  ItemTransform,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  ITEM_TRANSFORM_IDENTITY,
  ITEM_TRANSFORM_LIMITS,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  clampItemTransform,
  isIdentityTransform,
  resolveManualCropFitZoom,
} from '~/shared/lib/imageTransform'

export const CANVAS_BOUND = 420
export const RAIL_THUMBNAIL_BOUND = 36

export const SLIDER_ZOOM_MIN = 0.01
export const SLIDER_ZOOM_MAX = 2.5
export const ZOOM_SLIDER_STEP = 0.01

export const PAN_START_THRESHOLD_PX = 4
export const PAN_SNAP_THRESHOLD_PX = 5
export const WHEEL_ZOOM_SENSITIVITY = 0.0015

export interface AxisSnapCandidate
{
  value: number
  guide: boolean
}

export const applyAxisSnap = (
  value: number,
  threshold: number,
  candidates: readonly AxisSnapCandidate[]
): { value: number; guide: boolean } =>
{
  for (const candidate of candidates)
  {
    if (Math.abs(value - candidate.value) < threshold)
    {
      return { value: candidate.value, guide: candidate.guide }
    }
  }
  return { value, guide: false }
}

export const normalizeRotation = (raw: number): ItemRotation =>
{
  const wrapped = (((raw % 360) + 360) % 360) as ItemRotation
  return wrapped
}

export const createFitBaselineTransform = (
  item: TierItem,
  boardAspectRatio: number,
  fit: ImageFit,
  rotation: ItemRotation = 0
): ItemTransform =>
  clampItemTransform({
    ...ITEM_TRANSFORM_IDENTITY,
    rotation,
    zoom: resolveManualCropFitZoom(
      item.aspectRatio,
      boardAspectRatio,
      rotation,
      fit
    ),
  })

export const getSavedTransform = (item: TierItem): ItemTransform | undefined =>
  item.transform && !isIdentityTransform(item.transform)
    ? item.transform
    : undefined

export const seedTransform = (
  item: TierItem,
  boardAspectRatio: number,
  fit: ImageFit
): ItemTransform =>
  getSavedTransform(item) ??
  createFitBaselineTransform(item, boardAspectRatio, fit)

export const boundedAspectSize = (
  aspectRatio: number,
  bound: number
): { width: number; height: number } =>
{
  const safeRatio = aspectRatio > 0 ? aspectRatio : 1
  return safeRatio >= 1
    ? { width: bound, height: bound / safeRatio }
    : { width: bound * safeRatio, height: bound }
}

export const getDisplayZoomBounds = (
  zoomBaseline: number
): { min: number; max: number } =>
{
  const safeBaseline = zoomBaseline > 0 ? zoomBaseline : 1
  const min = Math.max(
    SLIDER_ZOOM_MIN,
    ITEM_TRANSFORM_LIMITS.zoomMin / safeBaseline
  )
  return {
    min,
    max: Math.max(
      min,
      Math.min(SLIDER_ZOOM_MAX, ITEM_TRANSFORM_LIMITS.zoomMax / safeBaseline)
    ),
  }
}

export const isInteractiveArrowTarget = (
  target: EventTarget | null
): boolean =>
{
  if (!(target instanceof Element)) return false
  if (target instanceof HTMLElement && target.isContentEditable) return true
  return (
    target.closest(
      'button,input,textarea,select,[contenteditable="true"],[role="button"],[role="radio"],[role="tab"],[role="switch"],[role="slider"],[role="menuitem"],[role="option"]'
    ) !== null
  )
}
