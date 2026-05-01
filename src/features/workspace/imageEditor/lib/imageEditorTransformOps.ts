// src/features/workspace/imageEditor/lib/imageEditorTransformOps.ts
// pure transform manipulators for the image editor (no React, no state)

import type {
  ItemRotation,
  ItemTransform,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  clampItemTransform,
  isSameItemTransform,
} from '~/shared/lib/imageTransform'
import { clamp } from '~/shared/lib/math'
import { normalizeRotation } from './imageEditorGeometry'

interface WheelZoomInput
{
  transform: ItemTransform
  baselineZoom: number
  displayZoomMin: number
  displayZoomMax: number
  cursorFracX: number
  cursorFracY: number
  factor: number
}

export const resolveImageEditorCommitTransform = (
  transform: ItemTransform,
  fitBaseline: ItemTransform
): ItemTransform | null =>
{
  const clamped = clampItemTransform(transform)
  return isSameItemTransform(clamped, fitBaseline) ? null : clamped
}

export const rotateImageEditorWorkingTransform = (
  transform: ItemTransform,
  delta: 90 | -90,
  getFitBaselineZoom: (rotation: ItemRotation) => number
): ItemTransform =>
{
  const currentBaselineZoom = getFitBaselineZoom(transform.rotation)
  const displayZoom = transform.zoom / currentBaselineZoom
  const rotation = normalizeRotation(transform.rotation + delta)
  return clampItemTransform({
    ...transform,
    rotation,
    zoom: displayZoom * getFitBaselineZoom(rotation),
  })
}

export const setImageEditorDisplayZoom = (
  transform: ItemTransform,
  displayZoom: number,
  baselineZoom: number
): ItemTransform =>
  clampItemTransform({
    ...transform,
    zoom: displayZoom * baselineZoom,
  })

export const centerImageEditorTransform = (
  transform: ItemTransform
): ItemTransform =>
  clampItemTransform({
    ...transform,
    offsetX: 0,
    offsetY: 0,
  })

export const nudgeImageEditorTransformByPixels = (
  transform: ItemTransform,
  dxPx: number,
  dyPx: number,
  canvasW: number,
  canvasH: number
): ItemTransform =>
  clampItemTransform({
    ...transform,
    offsetX: transform.offsetX + dxPx / canvasW,
    offsetY: transform.offsetY + dyPx / canvasH,
  })

export const zoomImageEditorTransformAtPoint = ({
  transform,
  baselineZoom,
  displayZoomMin,
  displayZoomMax,
  cursorFracX,
  cursorFracY,
  factor,
}: WheelZoomInput): ItemTransform =>
{
  const nextDisplayZoom = clamp(
    (transform.zoom / baselineZoom) * factor,
    displayZoomMin,
    displayZoomMax
  )
  const nextZoom = nextDisplayZoom * baselineZoom
  const actualFactor = nextZoom / transform.zoom
  return clampItemTransform({
    ...transform,
    zoom: nextZoom,
    offsetX: cursorFracX - actualFactor * (cursorFracX - transform.offsetX),
    offsetY: cursorFracY - actualFactor * (cursorFracY - transform.offsetY),
  })
}
