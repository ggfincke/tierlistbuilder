// src/features/workspace/imageEditor/ui/DraggableLabelOverlay.tsx
// draggable overlay-caption preview for image-editor canvas labels

import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'

import type { LabelOverlayPlacement } from '@tierlistbuilder/contracts/workspace/board'
import type { ResolvedLabelDisplay } from '~/shared/board-ui/labelDisplay'
import { OverlayLabelBlock as SharedOverlayLabelBlock } from '~/shared/board-ui/labelBlocks'
import { clamp } from '~/shared/lib/math'
import { applyAxisSnap } from '../lib/imageEditorGeometry'

interface DraggableLabelOverlayProps
{
  display: ResolvedLabelDisplay
  canvasRef: RefObject<HTMLDivElement | null>
  onDragMove: (x: number, y: number, snap: { x: boolean; y: boolean }) => void
  onDragEnd: () => void
}

const LABEL_SNAP_THRESHOLD_PX = 5

export const DraggableLabelOverlay = ({
  display,
  canvasRef,
  onDragMove,
  onDragEnd,
}: DraggableLabelOverlayProps) =>
{
  const placement = display.placement as LabelOverlayPlacement
  const dragRef = useRef<{
    startX: number
    startY: number
    baseX: number
    baseY: number
    canvasW: number
    canvasH: number
    halfW: number
    halfH: number
  } | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) =>
    {
      if (e.button !== 0) return
      const canvas = canvasRef.current
      if (!canvas) return
      e.stopPropagation()
      e.preventDefault()
      const canvasRect = canvas.getBoundingClientRect()
      if (canvasRect.width === 0 || canvasRect.height === 0) return
      const blockRect = e.currentTarget.getBoundingClientRect()
      e.currentTarget.setPointerCapture(e.pointerId)
      const halfW = Math.min(blockRect.width / canvasRect.width / 2, 0.5)
      const halfH = Math.min(blockRect.height / canvasRect.height / 2, 0.5)
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        baseX: placement.x,
        baseY: placement.y,
        canvasW: canvasRect.width,
        canvasH: canvasRect.height,
        halfW,
        halfH,
      }
      setIsDragging(true)
    },
    [canvasRef, placement.x, placement.y]
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) =>
    {
      const drag = dragRef.current
      if (!drag) return
      e.stopPropagation()
      const dx = (e.clientX - drag.startX) / drag.canvasW
      const dy = (e.clientY - drag.startY) / drag.canvasH
      let nextX = clamp(drag.baseX + dx, drag.halfW, 1 - drag.halfW)
      let nextY = clamp(drag.baseY + dy, drag.halfH, 1 - drag.halfH)
      let snapX = false
      let snapY = false

      if (!e.altKey)
      {
        const thresholdX = LABEL_SNAP_THRESHOLD_PX / drag.canvasW
        const thresholdY = LABEL_SNAP_THRESHOLD_PX / drag.canvasH
        const snapCandidatesX =
          0.5 >= drag.halfW && 0.5 <= 1 - drag.halfW
            ? [{ value: 0.5, guide: true }]
            : []
        const snapCandidatesY =
          0.5 >= drag.halfH && 0.5 <= 1 - drag.halfH
            ? [{ value: 0.5, guide: true }]
            : []
        const snapResultX = applyAxisSnap(nextX, thresholdX, snapCandidatesX)
        const snapResultY = applyAxisSnap(nextY, thresholdY, snapCandidatesY)
        if (snapResultX.guide)
        {
          nextX = snapResultX.value
          snapX = true
        }
        if (snapResultY.guide)
        {
          nextY = snapResultY.value
          snapY = true
        }
      }
      onDragMove(nextX, nextY, { x: snapX, y: snapY })
    },
    [onDragMove]
  )

  const onPointerEnd = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) =>
    {
      if (!dragRef.current) return
      e.stopPropagation()
      try
      {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
      catch
      {
        // capture was already released; safe to ignore
      }
      dragRef.current = null
      setIsDragging(false)
      onDragEnd()
    },
    [onDragEnd]
  )

  return (
    <SharedOverlayLabelBlock
      display={display}
      interactive
      role="button"
      ariaLabel="Drag to reposition caption"
      tabIndex={-1}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      extraStyle={{
        zIndex: 1,
        touchAction: 'none',
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
    />
  )
}
