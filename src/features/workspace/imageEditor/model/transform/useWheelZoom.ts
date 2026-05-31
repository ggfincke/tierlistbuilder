// src/features/workspace/imageEditor/model/transform/useWheelZoom.ts
// cursor-centered wheel zoom for the image editor preview

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

import type { ItemRotation } from '@tierlistbuilder/contracts/workspace/board'
import { getPaddingFrameScale } from '~/shared/board-ui/aspectRatio'
import { clamp } from '~/shared/lib/math'
import {
  getDisplayZoomBounds,
  WHEEL_ZOOM_SENSITIVITY,
} from '~/features/workspace/imageEditor/lib/imageEditorGeometry'
import { zoomImageEditorTransformAtPoint } from '~/features/workspace/imageEditor/lib/imageEditorTransformOps'
import type { ImageEditorTransformDraftSetter } from '~/features/workspace/imageEditor/model/transform/useImageEditorTransformDraft'

interface UseWheelZoomInput
{
  canvasRef: RefObject<HTMLDivElement | null>
  enabled: boolean
  getFitBaselineZoom: (rotation: ItemRotation) => number
  padding: number
  setWorkingDraft: ImageEditorTransformDraftSetter
}

const normalizeCursorFraction = (
  cursorPos: number,
  frameStart: number,
  frameSize: number
): number =>
{
  const raw = (cursorPos - frameStart) / frameSize - 0.5
  return clamp(raw, -0.5, 0.5)
}

export const useWheelZoom = ({
  canvasRef,
  enabled,
  getFitBaselineZoom,
  padding,
  setWorkingDraft,
}: UseWheelZoomInput): void =>
{
  // read live padding inside the listener so a padding-slider drag doesn't
  // tear down & re-add the wheel handler on every tick
  const paddingRef = useRef(padding)
  useLayoutEffect(() =>
  {
    paddingRef.current = padding
  }, [padding])

  useEffect(() =>
  {
    const canvas = canvasRef.current
    if (!canvas || !enabled) return
    const onWheel = (event: WheelEvent) =>
    {
      event.preventDefault()
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const pad = paddingRef.current
      const paddingScale = getPaddingFrameScale(pad)
      const frameWidth = rect.width * paddingScale
      const frameHeight = rect.height * paddingScale
      if (frameWidth === 0 || frameHeight === 0) return
      const frameLeft = rect.left + rect.width * pad
      const frameTop = rect.top + rect.height * pad
      const cursorFracX = normalizeCursorFraction(
        event.clientX,
        frameLeft,
        frameWidth
      )
      const cursorFracY = normalizeCursorFraction(
        event.clientY,
        frameTop,
        frameHeight
      )
      const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY)
      setWorkingDraft((working) =>
      {
        const currentBaselineZoom = getFitBaselineZoom(working.rotation)
        const { min, max } = getDisplayZoomBounds(currentBaselineZoom)
        return zoomImageEditorTransformAtPoint({
          transform: working,
          baselineZoom: currentBaselineZoom,
          displayZoomMin: min,
          displayZoomMax: max,
          cursorFracX,
          cursorFracY,
          factor,
        })
      })
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [canvasRef, enabled, getFitBaselineZoom, setWorkingDraft])
}
