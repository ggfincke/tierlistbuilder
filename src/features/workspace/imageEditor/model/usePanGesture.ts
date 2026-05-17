// src/features/workspace/imageEditor/model/usePanGesture.ts
// pointer-pan gesture & snap-guide state for the image editor preview

import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import type { ItemTransform } from '@tierlistbuilder/contracts/workspace/board'
import {
  clampItemTransform,
  resolveManualCropImageSize,
} from '~/shared/lib/imageTransform'
import {
  applyAxisSnap,
  PAN_SNAP_THRESHOLD_PX,
  PAN_START_THRESHOLD_PX,
} from '../lib/imageEditorGeometry'
import type { ImageEditorTransformDraftSetter } from './useImageEditorTransformDraft'

interface UsePanGestureInput
{
  canvasHeight: number
  canvasWidth: number
  enabled: boolean
  frameAspectRatio: number
  intrinsicAspectRatio: number | null | undefined
  setWorkingDraft: ImageEditorTransformDraftSetter
  working: ItemTransform
}

export const usePanGesture = ({
  canvasHeight,
  canvasWidth,
  enabled,
  frameAspectRatio,
  intrinsicAspectRatio,
  setWorkingDraft,
  working,
}: UsePanGestureInput) =>
{
  const [isDragging, setIsDragging] = useState(false)
  const [snap, setSnap] = useState<{ x: boolean; y: boolean }>({
    x: false,
    y: false,
  })
  const dragRef = useRef<{
    startX: number
    startY: number
    baseOffX: number
    baseOffY: number
    moved: boolean
    visualW: number
    visualH: number
  } | null>(null)

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) =>
    {
      if (event.button !== 0 || !enabled) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      setIsDragging(true)
      const cropSize = resolveManualCropImageSize(
        intrinsicAspectRatio ?? undefined,
        frameAspectRatio,
        working.rotation
      )
      const wp = (cropSize.widthPercent / 100) * working.zoom
      const hp = (cropSize.heightPercent / 100) * working.zoom
      const isQuarterTurn = working.rotation === 90 || working.rotation === 270
      const visualW = isQuarterTurn ? hp / frameAspectRatio : wp
      const visualH = isQuarterTurn ? wp * frameAspectRatio : hp
      dragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        baseOffX: working.offsetX,
        baseOffY: working.offsetY,
        moved: false,
        visualW,
        visualH,
      }
    },
    [
      enabled,
      frameAspectRatio,
      intrinsicAspectRatio,
      working.offsetX,
      working.offsetY,
      working.rotation,
      working.zoom,
    ]
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) =>
    {
      const drag = dragRef.current
      if (!drag) return
      const deltaX = event.clientX - drag.startX
      const deltaY = event.clientY - drag.startY
      if (!drag.moved && Math.hypot(deltaX, deltaY) < PAN_START_THRESHOLD_PX)
      {
        return
      }
      drag.moved = true
      let nextOffsetX = drag.baseOffX + deltaX / canvasWidth
      let nextOffsetY = drag.baseOffY + deltaY / canvasHeight
      let snapX = false
      let snapY = false

      if (!event.altKey)
      {
        const thresholdX = PAN_SNAP_THRESHOLD_PX / canvasWidth
        const thresholdY = PAN_SNAP_THRESHOLD_PX / canvasHeight
        const edgeOffsetX = (drag.visualW - 1) / 2
        const edgeOffsetY = (drag.visualH - 1) / 2
        const snapResultX = applyAxisSnap(
          nextOffsetX,
          thresholdX,
          drag.visualW > 1
            ? [
                { value: 0, guide: true },
                { value: edgeOffsetX, guide: false },
                { value: -edgeOffsetX, guide: false },
              ]
            : [{ value: 0, guide: true }]
        )
        const snapResultY = applyAxisSnap(
          nextOffsetY,
          thresholdY,
          drag.visualH > 1
            ? [
                { value: 0, guide: true },
                { value: edgeOffsetY, guide: false },
                { value: -edgeOffsetY, guide: false },
              ]
            : [{ value: 0, guide: true }]
        )
        nextOffsetX = snapResultX.value
        nextOffsetY = snapResultY.value
        snapX = snapResultX.guide
        snapY = snapResultY.guide
      }
      setSnap((prev) =>
        prev.x === snapX && prev.y === snapY ? prev : { x: snapX, y: snapY }
      )
      setWorkingDraft((current) =>
        clampItemTransform({
          ...current,
          offsetX: nextOffsetX,
          offsetY: nextOffsetY,
        })
      )
    },
    [canvasWidth, canvasHeight, setWorkingDraft]
  )

  const onPointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) =>
    {
      const drag = dragRef.current
      if (!drag)
      {
        setIsDragging(false)
        return
      }
      try
      {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      catch
      {
        // capture was already released; safe to ignore
      }
      dragRef.current = null
      setIsDragging(false)
      setSnap({ x: false, y: false })
    },
    []
  )

  return {
    isDragging,
    onPointerDown,
    onPointerEnd,
    onPointerMove,
    snap,
  }
}
