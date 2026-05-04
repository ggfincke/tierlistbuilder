// src/features/workspace/imageEditor/ui/ImageEditorPane.tsx
// active item editor pane for image transforms, captions, & navigation

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Crop } from 'lucide-react'

import type { TextStyleId } from '@tierlistbuilder/contracts/lib/theme'
import type {
  BoardLabelSettings,
  GlobalLabelDefaults,
  ImageFit,
  ItemLabelOptions,
  ItemTransform,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import type { ItemSize } from '@tierlistbuilder/contracts/platform/preferences'
import {
  formatAspectRatio,
  getEffectiveImageFit,
  itemHasAspectMismatch,
} from '~/shared/board-ui/aspectRatio'
import { OBJECT_FIT_CLASS } from '~/shared/board-ui/constants'
import { useImageUrl } from '~/shared/hooks/useImageUrl'
import { getImageRefsByRendition } from '~/shared/lib/imageRefs'
import {
  buildManualCropImgStyle,
  clampItemTransform,
  resolveManualCropImageSize,
} from '~/shared/lib/imageTransform'
import {
  applyAxisSnap,
  getDisplayZoomBounds,
  isInteractiveArrowTarget,
  PAN_SNAP_THRESHOLD_PX,
  PAN_START_THRESHOLD_PX,
  WHEEL_ZOOM_SENSITIVITY,
} from '../lib/imageEditorGeometry'
import { useMeasuredElementSize } from '../lib/useMeasuredElementSize'
import type { PendingImageEditorPaneEdit } from '../model/pendingImageEdit'
import {
  nudgeImageEditorTransformByPixels,
  zoomImageEditorTransformAtPoint,
} from '../lib/imageEditorTransformOps'
import { useImageEditorAutoCropItem } from '../model/useImageEditorAutoCropItem'
import { useImageEditorTransformDraft } from '../model/useImageEditorTransformDraft'
import { usePaneLabelEditor } from '../model/usePaneLabelEditor'
import { ImageEditorPaneFooter } from './ImageEditorPaneFooter'
import { ImageEditorPreviewCanvas } from './ImageEditorPreviewCanvas'
import { LabelEditorRow } from './LabelEditorRow'
import { SaveStatusIndicator } from './SaveStatusIndicator'

export interface ImageEditorPaneHandle
{
  getPendingEdit: () => PendingImageEditorPaneEdit | null
  flushPendingEdit: () => void
}

interface ImageEditorPaneProps
{
  item: TierItem
  boardAspectRatio: number
  boardDefaultFit: ImageFit | undefined
  trimSoftShadows: boolean
  boardLabels: BoardLabelSettings | undefined
  globalLabelDefaults: GlobalLabelDefaults
  globalTextStyleId: TextStyleId
  boardItemSize: ItemSize
  onCommit: (transform: ItemTransform | null) => void
  onLabelChange: (label: string) => void
  onLabelOptionsChange: (options: ItemLabelOptions | null) => void
  onApplyLabelToAll: () => void
  canApplyLabelToAll: boolean
  labelAppliedToAll: boolean
  applyLabelToAllTitle: string
  captionExpanded: boolean
  onCaptionExpandedChange: (expanded: boolean) => void
  imageExpanded: boolean
  onImageExpandedChange: (expanded: boolean) => void
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
  onSkip: () => void
  canSkip: boolean
}

export const ImageEditorPane = forwardRef<
  ImageEditorPaneHandle,
  ImageEditorPaneProps
>(function ImageEditorPane(
  {
    item,
    boardAspectRatio,
    boardDefaultFit,
    trimSoftShadows,
    boardLabels,
    globalLabelDefaults,
    globalTextStyleId,
    boardItemSize,
    onCommit,
    onLabelChange,
    onLabelOptionsChange,
    onApplyLabelToAll,
    canApplyLabelToAll,
    labelAppliedToAll,
    applyLabelToAllTitle,
    captionExpanded,
    onCaptionExpandedChange,
    imageExpanded,
    onImageExpandedChange,
    canPrev,
    canNext,
    onPrev,
    onNext,
    onSkip,
    canSkip,
  }: ImageEditorPaneProps,
  ref
)
{
  const imageSectionId = useId()
  // editor priority is source -> tile -> preview; subscribe to all three so
  // the canvas paints the next-best rendition while higher-quality bytes warm
  const editorRefs = getImageRefsByRendition(item, 'editor')
  const primaryUrl = useImageUrl(editorRefs[0]?.hash)
  const secondaryUrl = useImageUrl(editorRefs[1]?.hash)
  const tertiaryUrl = useImageUrl(editorRefs[2]?.hash)
  const url = primaryUrl ?? secondaryUrl ?? tertiaryUrl
  const effectiveFit = getEffectiveImageFit(item, boardDefaultFit)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const {
    labelDraft,
    updateLabelDraft,
    commitLabel,
    updateLabelOption,
    handleFontSizePxChange,
    placementDraft,
    labelDragSnap,
    handleLabelDragMove,
    handleLabelDragEnd,
    handlePlacementChange,
    resolvedPlacement,
    captionPreviewMode,
    previewW,
    previewH,
    previewLabelDisplay,
    showLivePreview,
    labelLayout,
    inheritedTextStyleLabel,
    boardDefaultVisible,
  } = usePaneLabelEditor({
    item,
    boardAspectRatio,
    boardLabels,
    globalLabelDefaults,
    globalTextStyleId,
    boardItemSize,
    onLabelChange,
    onLabelOptionsChange,
  })
  const canvasSize = useMeasuredElementSize(canvasRef, {
    width: previewW,
    height: previewH,
  })
  const canvasW = canvasSize.width
  const canvasH = canvasSize.height
  const frameAspectRatio =
    canvasW > 0 && canvasH > 0 ? canvasW / canvasH : boardAspectRatio
  const {
    working,
    setWorkingDraft,
    isDirty,
    savedFlash,
    hasChanges,
    displayZoom,
    displayZoomMin,
    displaySliderZoomMax,
    getFitBaselineZoom,
    getPendingTransformEdit,
    flushPendingTransform,
    rotate,
    setZoomLive,
    reset,
    centerOffsets,
  } = useImageEditorTransformDraft({
    item,
    frameAspectRatio,
    effectiveFit,
    onCommit,
  })
  const { status: autoCropStatus, autoCrop } = useImageEditorAutoCropItem({
    item,
    trimSoftShadows,
    frameAspectRatio,
    working,
    setWorkingDraft,
  })
  const [isDragging, setIsDragging] = useState(false)
  const [snap, setSnap] = useState<{ x: boolean; y: boolean }>({
    x: false,
    y: false,
  })
  const commitLabelRef = useRef(commitLabel)

  useEffect(() =>
  {
    commitLabelRef.current = commitLabel
  }, [commitLabel])

  useImperativeHandle(
    ref,
    () => ({
      getPendingEdit: getPendingTransformEdit,
      flushPendingEdit: () =>
      {
        commitLabelRef.current()
        flushPendingTransform()
      },
    }),
    [flushPendingTransform, getPendingTransformEdit]
  )

  useEffect(
    () => () =>
    {
      commitLabelRef.current()
    },
    []
  )

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
    (e: ReactPointerEvent<HTMLDivElement>) =>
    {
      if (e.button !== 0 || !url) return
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      setIsDragging(true)
      const cropSize = resolveManualCropImageSize(
        item.aspectRatio,
        frameAspectRatio,
        working.rotation
      )
      const wp = (cropSize.widthPercent / 100) * working.zoom
      const hp = (cropSize.heightPercent / 100) * working.zoom
      const isQuarterTurn = working.rotation === 90 || working.rotation === 270
      const visualW = isQuarterTurn ? hp / frameAspectRatio : wp
      const visualH = isQuarterTurn ? wp * frameAspectRatio : hp
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        baseOffX: working.offsetX,
        baseOffY: working.offsetY,
        moved: false,
        visualW,
        visualH,
      }
    },
    [
      working.offsetX,
      working.offsetY,
      working.zoom,
      working.rotation,
      item.aspectRatio,
      frameAspectRatio,
      url,
    ]
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) =>
    {
      const drag = dragRef.current
      if (!drag) return
      const deltaX = e.clientX - drag.startX
      const deltaY = e.clientY - drag.startY
      if (!drag.moved && Math.hypot(deltaX, deltaY) < PAN_START_THRESHOLD_PX)
      {
        return
      }
      drag.moved = true
      let nextOffsetX = drag.baseOffX + deltaX / canvasW
      let nextOffsetY = drag.baseOffY + deltaY / canvasH
      let snapX = false
      let snapY = false

      if (!e.altKey)
      {
        const thresholdX = PAN_SNAP_THRESHOLD_PX / canvasW
        const thresholdY = PAN_SNAP_THRESHOLD_PX / canvasH
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
      setWorkingDraft((w) =>
        clampItemTransform({
          ...w,
          offsetX: nextOffsetX,
          offsetY: nextOffsetY,
        })
      )
    },
    [canvasW, canvasH, setWorkingDraft]
  )

  const onPointerEnd = useCallback((e: ReactPointerEvent<HTMLDivElement>) =>
  {
    const drag = dragRef.current
    if (!drag)
    {
      setIsDragging(false)
      return
    }
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
    setSnap({ x: false, y: false })
  }, [])

  useEffect(() =>
  {
    if (!url) return
    const onKey = (e: KeyboardEvent) =>
    {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey) return
      if (isInteractiveArrowTarget(e.target)) return
      let dxPx = 0
      let dyPx = 0
      switch (e.key)
      {
        case 'ArrowLeft':
          dxPx = -1
          break
        case 'ArrowRight':
          dxPx = 1
          break
        case 'ArrowUp':
          dyPx = -1
          break
        case 'ArrowDown':
          dyPx = 1
          break
        default:
          return
      }
      if (e.shiftKey)
      {
        dxPx *= 10
        dyPx *= 10
      }
      e.preventDefault()
      setWorkingDraft((w) =>
        nudgeImageEditorTransformByPixels(w, dxPx, dyPx, canvasW, canvasH)
      )
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [url, canvasW, canvasH, setWorkingDraft])

  useEffect(() =>
  {
    const canvas = canvasRef.current
    if (!canvas || !url) return
    const onWheel = (e: WheelEvent) =>
    {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const cursorFracX = (e.clientX - rect.left) / rect.width - 0.5
      const cursorFracY = (e.clientY - rect.top) / rect.height - 0.5
      const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_SENSITIVITY)
      setWorkingDraft((w) =>
      {
        const currentBaselineZoom = getFitBaselineZoom(w.rotation)
        const { min, max } = getDisplayZoomBounds(currentBaselineZoom)
        return zoomImageEditorTransformAtPoint({
          transform: w,
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
  }, [url, getFitBaselineZoom, setWorkingDraft])

  const useManualCrop =
    hasChanges || effectiveFit === 'cover' || !!item.aspectRatio
  const imgClass = useManualCrop
    ? 'absolute max-w-none select-none'
    : `h-full w-full ${OBJECT_FIT_CLASS[effectiveFit]}`
  const imgStyle = useManualCrop
    ? buildManualCropImgStyle(working, {
        intrinsicAspect: item.aspectRatio,
        frameAspect: frameAspectRatio,
        willChangeTransform: true,
        pointerEventsNone: true,
      })
    : { pointerEvents: 'none' as const }
  const ratioLabel = item.aspectRatio
    ? formatAspectRatio(item.aspectRatio)
    : '-'
  const mismatched = itemHasAspectMismatch(item, boardAspectRatio)
  const boardRatioLabel = formatAspectRatio(boardAspectRatio)
  const ratioBadgeClass = mismatched
    ? 'border-[var(--t-warning)]/50 bg-[var(--t-warning)]/10 text-[var(--t-warning)]'
    : 'border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] text-[var(--t-text-muted)]'
  const ratioBadgeActionableClass = mismatched
    ? 'cursor-pointer hover:border-[var(--t-warning)] hover:bg-[var(--t-warning)]/20 active:bg-[var(--t-warning)]/30'
    : 'cursor-pointer hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-active)]'
  const ratioChipActionable =
    mismatched && (autoCropStatus === 'ready' || autoCropStatus === 'pending')
  const ratioChipTitle = mismatched
    ? ratioChipActionable
      ? `Item is ${ratioLabel} - board is ${boardRatioLabel}. Click to auto-crop to fit.`
      : `Item is ${ratioLabel} - board is ${boardRatioLabel}. Crop or pick a new ratio.`
    : `Item & board both ${boardRatioLabel}`

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--t-border-secondary)] px-5 py-2 text-xs text-[var(--t-text-muted)]">
        <div className="flex min-w-0 items-center gap-2">
          <input
            type="text"
            value={labelDraft}
            onChange={(e) => updateLabelDraft(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) =>
            {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            placeholder="Untitled"
            aria-label="Item name"
            spellCheck={false}
            className="focus-custom min-w-0 flex-1 truncate rounded border border-transparent bg-transparent px-1.5 py-0.5 font-medium text-[var(--t-text-secondary)] outline-none placeholder:text-[var(--t-text-faint)] hover:border-[var(--t-border-secondary)] focus-visible:border-[var(--t-border-hover)] focus-visible:bg-[var(--t-bg-surface)] focus-visible:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
          />
          <SaveStatusIndicator dirty={isDirty} savedFlash={savedFlash} />
        </div>
        {ratioChipActionable ? (
          <button
            type="button"
            onClick={autoCrop}
            className={`focus-custom inline-flex items-center gap-1 rounded-md border px-2 py-0.5 tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] ${ratioBadgeClass} ${ratioBadgeActionableClass}`}
            title={ratioChipTitle}
            aria-label={`Auto-crop ${ratioLabel} item to fit ${boardRatioLabel} board`}
          >
            <Crop aria-hidden="true" className="h-3 w-3" />
            <span>{ratioLabel}</span>
            <span aria-hidden="true">-&gt;</span>
            <span>{boardRatioLabel}</span>
          </button>
        ) : (
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 tabular-nums ${ratioBadgeClass}`}
            title={ratioChipTitle}
          >
            <span>{ratioLabel}</span>
            <span aria-hidden="true">-&gt;</span>
            <span>{boardRatioLabel}</span>
          </span>
        )}
      </div>
      <ImageEditorPreviewCanvas
        item={item}
        url={url}
        previewW={previewW}
        previewH={previewH}
        canvasRef={canvasRef}
        captionPreviewMode={captionPreviewMode}
        resolvedPlacement={resolvedPlacement}
        previewLabelDisplay={previewLabelDisplay}
        imgClass={imgClass}
        imgStyle={imgStyle}
        isDragging={isDragging}
        snap={snap}
        placementDraft={placementDraft}
        labelDragSnap={labelDragSnap}
        showLivePreview={showLivePreview}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerEnd={onPointerEnd}
        onLabelDragMove={handleLabelDragMove}
        onLabelDragEnd={handleLabelDragEnd}
      />
      <LabelEditorRow
        resolvedPlacement={resolvedPlacement}
        resolvedScrim={labelLayout.scrim}
        resolvedTextColor={labelLayout.textColor}
        resolvedFontSizePx={labelLayout.fontSizePx}
        resolvedTextStyleId={labelLayout.textStyleId}
        inheritedTextStyleLabel={inheritedTextStyleLabel}
        boardDefaultVisible={boardDefaultVisible}
        itemOptions={item.labelOptions}
        onPlacementChange={handlePlacementChange}
        onScrimChange={(s) => updateLabelOption('scrim', s)}
        onTextColorChange={(c) => updateLabelOption('textColor', c)}
        onFontSizePxChange={handleFontSizePxChange}
        onTextStyleChange={(t) => updateLabelOption('textStyleId', t)}
        onVisibleChange={(v) => updateLabelOption('visible', v)}
        onClearOverrides={() => onLabelOptionsChange(null)}
        onApplyToAll={onApplyLabelToAll}
        canApplyToAll={canApplyLabelToAll}
        appliedToAll={labelAppliedToAll}
        applyToAllTitle={applyLabelToAllTitle}
        expanded={captionExpanded}
        onExpandedChange={onCaptionExpandedChange}
      />
      <ImageEditorPaneFooter
        expansion={{
          imageSectionId,
          imageExpanded,
          onImageExpandedChange,
        }}
        transform={{
          rotate,
          displayZoom,
          displayZoomMin,
          displaySliderZoomMax,
          onZoomLiveChange: setZoomLive,
          centerOffsets,
          working,
          autoCrop,
          autoCropStatus,
          reset,
          hasChanges,
          isDirty,
        }}
        navigation={{
          canPrev,
          canNext,
          canSkip,
          onPrev,
          onNext,
          onSkip,
        }}
      />
    </div>
  )
})
