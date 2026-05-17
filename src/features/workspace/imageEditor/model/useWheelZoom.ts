// src/features/workspace/imageEditor/model/useWheelZoom.ts
// cursor-centered wheel zoom for the image editor preview

import { useEffect, type RefObject } from 'react'

import type { ItemRotation } from '@tierlistbuilder/contracts/workspace/board'
import {
  getDisplayZoomBounds,
  WHEEL_ZOOM_SENSITIVITY,
} from '../lib/imageEditorGeometry'
import { zoomImageEditorTransformAtPoint } from '../lib/imageEditorTransformOps'
import type { ImageEditorTransformDraftSetter } from './useImageEditorTransformDraft'

interface UseWheelZoomInput
{
  canvasRef: RefObject<HTMLDivElement | null>
  enabled: boolean
  getFitBaselineZoom: (rotation: ItemRotation) => number
  setWorkingDraft: ImageEditorTransformDraftSetter
}

export const useWheelZoom = ({
  canvasRef,
  enabled,
  getFitBaselineZoom,
  setWorkingDraft,
}: UseWheelZoomInput): void =>
{
  useEffect(() =>
  {
    const canvas = canvasRef.current
    if (!canvas || !enabled) return
    const onWheel = (event: WheelEvent) =>
    {
      event.preventDefault()
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const cursorFracX = (event.clientX - rect.left) / rect.width - 0.5
      const cursorFracY = (event.clientY - rect.top) / rect.height - 0.5
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
