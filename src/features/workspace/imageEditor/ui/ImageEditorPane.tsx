// src/features/workspace/imageEditor/ui/ImageEditorPane.tsx
// active item editor pane for image transforms, captions, & navigation

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Crop } from 'lucide-react'

import type { TextStyleId } from '@tierlistbuilder/contracts/lib/theme'
import type {
  BoardLabelSettings,
  ImageFit,
  ItemLabelOptions,
  ItemRotation,
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
import {
  clampItemTransform,
  isSameItemTransform,
  itemTransformToCropCss,
  resolveManualCropImageSize,
} from '~/shared/lib/imageTransform'
import { clamp } from '~/shared/lib/math'
import {
  detectContentBBox,
  getAutoCropCacheVersion,
  getAutoCropHash,
  getCachedBBox,
  loadAutoCropBlob,
  resolveAutoCropTransform,
  subscribeAutoCropCache,
} from '~/shared/lib/autoCrop'
import { warmImageHashes } from '~/shared/images/imageBlobCache'
import {
  applyAxisSnap,
  createFitBaselineTransform,
  getDisplayZoomBounds,
  getSavedTransform,
  isInteractiveArrowTarget,
  normalizeRotation,
  PAN_SNAP_THRESHOLD_PX,
  PAN_START_THRESHOLD_PX,
  seedTransform,
  SLIDER_ZOOM_MAX,
  WHEEL_ZOOM_SENSITIVITY,
} from '../lib/imageEditorGeometry'
import { useMeasuredElementSize } from '../lib/useMeasuredElementSize'
import type { PendingImageEditorPaneEdit } from '../model/pendingImageEdit'
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
  globalShowLabels: boolean
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
    globalShowLabels,
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
  const sourceUrl = useImageUrl(
    item.sourceImageRef?.hash,
    item.sourceImageRef?.cloudMediaExternalId
  )
  const displayUrl = useImageUrl(
    item.imageRef?.hash,
    item.imageRef?.cloudMediaExternalId
  )
  const url = sourceUrl ?? displayUrl
  const autoCropHash = getAutoCropHash(item)
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
    globalShowLabels,
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
  const fitBaseline = useMemo(
    () => createFitBaselineTransform(item, frameAspectRatio, effectiveFit),
    [item, frameAspectRatio, effectiveFit]
  )
  const savedTransform = getSavedTransform(item)
  const hasSavedTransform = !!savedTransform
  const [working, setWorking] = useState<ItemTransform>(() =>
    seedTransform(item, frameAspectRatio, effectiveFit)
  )
  const [isDragging, setIsDragging] = useState(false)
  const [snap, setSnap] = useState<{ x: boolean; y: boolean }>({
    x: false,
    y: false,
  })
  const [autoCropping, setAutoCropping] = useState(false)

  useSyncExternalStore(
    subscribeAutoCropCache,
    getAutoCropCacheVersion,
    getAutoCropCacheVersion
  )
  const autoCropResult = getCachedBBox(autoCropHash, trimSoftShadows)

  useEffect(() =>
  {
    if (!item.sourceImageRef?.hash || sourceUrl) return
    void warmImageHashes([item.sourceImageRef.hash])
  }, [item.sourceImageRef?.hash, sourceUrl])

  const resolveCommitTransform = useCallback(
    (transform: ItemTransform): ItemTransform | null =>
    {
      const clamped = clampItemTransform(transform)
      return isSameItemTransform(clamped, fitBaseline) ? null : clamped
    },
    [fitBaseline]
  )

  const flushCommit = useCallback(
    (transform: ItemTransform) => onCommit(resolveCommitTransform(transform)),
    [onCommit, resolveCommitTransform]
  )

  const committed = savedTransform ?? fitBaseline
  const isDirty = !isSameItemTransform(working, committed)
  const [savedFlash, setSavedFlash] = useState(false)
  const workingRef = useRef(working)
  workingRef.current = working
  const committedRef = useRef(committed)
  committedRef.current = committed
  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty
  const flushCommitRef = useRef(flushCommit)
  flushCommitRef.current = flushCommit
  const commitLabelRef = useRef(commitLabel)
  commitLabelRef.current = commitLabel
  const itemIdRef = useRef(item.id)
  itemIdRef.current = item.id
  const resolveCommitTransformRef = useRef(resolveCommitTransform)
  resolveCommitTransformRef.current = resolveCommitTransform
  const autoCommitTimerRef = useRef<number | null>(null)
  const savedFlashTimerRef = useRef<number | null>(null)

  const clearAutoCommitTimer = useCallback(() =>
  {
    if (autoCommitTimerRef.current === null) return
    window.clearTimeout(autoCommitTimerRef.current)
    autoCommitTimerRef.current = null
  }, [])

  const clearSavedFlashTimer = useCallback(() =>
  {
    if (savedFlashTimerRef.current === null) return
    window.clearTimeout(savedFlashTimerRef.current)
    savedFlashTimerRef.current = null
  }, [])

  const showSavedFlash = useCallback(() =>
  {
    clearSavedFlashTimer()
    setSavedFlash(true)
    savedFlashTimerRef.current = window.setTimeout(() =>
    {
      savedFlashTimerRef.current = null
      setSavedFlash(false)
    }, 1200)
  }, [clearSavedFlashTimer])

  const scheduleAutoCommit = useCallback(() =>
  {
    clearAutoCommitTimer()
    autoCommitTimerRef.current = window.setTimeout(() =>
    {
      autoCommitTimerRef.current = null
      if (!isDirtyRef.current) return
      flushCommitRef.current(workingRef.current)
      isDirtyRef.current = false
      showSavedFlash()
    }, 350)
  }, [clearAutoCommitTimer, showSavedFlash])

  const setWorkingDraft = useCallback(
    (
      nextOrUpdate: ItemTransform | ((current: ItemTransform) => ItemTransform)
    ) =>
    {
      const current = workingRef.current
      const next =
        typeof nextOrUpdate === 'function'
          ? nextOrUpdate(current)
          : nextOrUpdate
      if (isSameItemTransform(current, next)) return
      workingRef.current = next
      const nextDirty = !isSameItemTransform(next, committedRef.current)
      isDirtyRef.current = nextDirty
      if (nextDirty)
      {
        setSavedFlash(false)
        scheduleAutoCommit()
      }
      else
      {
        clearAutoCommitTimer()
      }
      setWorking(next)
    },
    [clearAutoCommitTimer, scheduleAutoCommit]
  )

  const previousCommittedRef = useRef(committed)
  useEffect(() =>
  {
    const previous = previousCommittedRef.current
    if (isSameItemTransform(previous, committed)) return
    previousCommittedRef.current = committed
    const current = workingRef.current
    if (isSameItemTransform(current, previous))
    {
      workingRef.current = committed
      isDirtyRef.current = false
      clearAutoCommitTimer()
      setWorking(committed)
      return
    }
    if (isSameItemTransform(current, committed))
    {
      isDirtyRef.current = false
      clearAutoCommitTimer()
    }
  }, [clearAutoCommitTimer, committed])

  useImperativeHandle(ref, () => ({
    getPendingEdit: () =>
      isDirtyRef.current
        ? {
            id: itemIdRef.current,
            transform: resolveCommitTransformRef.current(workingRef.current),
          }
        : null,
    flushPendingEdit: () =>
    {
      commitLabelRef.current()
      if (!isDirtyRef.current) return
      clearAutoCommitTimer()
      flushCommitRef.current(workingRef.current)
      isDirtyRef.current = false
    },
  }))

  useEffect(
    () => () =>
    {
      clearAutoCommitTimer()
      clearSavedFlashTimer()
      commitLabelRef.current()
      if (isDirtyRef.current) flushCommitRef.current(workingRef.current)
    },
    [clearAutoCommitTimer, clearSavedFlashTimer]
  )

  const getFitBaselineZoom = useCallback(
    (rotation: ItemRotation) =>
      createFitBaselineTransform(item, frameAspectRatio, effectiveFit, rotation)
        .zoom,
    [item, frameAspectRatio, effectiveFit]
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

  const rotate = useCallback(
    (delta: 90 | -90) =>
    {
      const currentBaselineZoom = getFitBaselineZoom(working.rotation)
      const displayZoom = working.zoom / currentBaselineZoom
      const rotation = normalizeRotation(working.rotation + delta)
      setWorkingDraft({
        ...working,
        rotation,
        zoom: displayZoom * getFitBaselineZoom(rotation),
      })
    },
    [working, getFitBaselineZoom, setWorkingDraft]
  )

  const setZoomLive = useCallback(
    (zoom: number) =>
      setWorkingDraft((w) =>
        clampItemTransform({
          ...w,
          zoom: zoom * getFitBaselineZoom(w.rotation),
        })
      ),
    [getFitBaselineZoom, setWorkingDraft]
  )

  const reset = useCallback(() =>
  {
    setWorkingDraft(fitBaseline)
  }, [fitBaseline, setWorkingDraft])

  const centerOffsets = useCallback(() =>
  {
    setWorkingDraft((w) => clampItemTransform({ ...w, offsetX: 0, offsetY: 0 }))
  }, [setWorkingDraft])

  const autoCrop = useCallback(async () =>
  {
    if (!autoCropHash || autoCropping) return
    setAutoCropping(true)
    try
    {
      let bbox = getCachedBBox(autoCropHash, trimSoftShadows)
      if (bbox === undefined)
      {
        const autoCropRef =
          item.sourceImageRef?.hash === autoCropHash
            ? item.sourceImageRef
            : item.imageRef
        const record = await loadAutoCropBlob(autoCropRef)
        if (!record) return
        bbox = await detectContentBBox(
          record.bytes,
          autoCropHash,
          trimSoftShadows
        )
      }
      if (!bbox) return
      setWorkingDraft(
        resolveAutoCropTransform(item, bbox, frameAspectRatio, working.rotation)
      )
    }
    finally
    {
      setAutoCropping(false)
    }
  }, [
    autoCropHash,
    trimSoftShadows,
    autoCropping,
    item,
    frameAspectRatio,
    setWorkingDraft,
    working.rotation,
  ])

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
        clampItemTransform({
          ...w,
          offsetX: w.offsetX + dxPx / canvasW,
          offsetY: w.offsetY + dyPx / canvasH,
        })
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
        const nextDisplayZoom = clamp(
          (w.zoom / currentBaselineZoom) * factor,
          min,
          max
        )
        const nextZoom = nextDisplayZoom * currentBaselineZoom
        const actualFactor = nextZoom / w.zoom
        return clampItemTransform({
          ...w,
          zoom: nextZoom,
          offsetX: cursorFracX - actualFactor * (cursorFracX - w.offsetX),
          offsetY: cursorFracY - actualFactor * (cursorFracY - w.offsetY),
        })
      })
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [url, getFitBaselineZoom, setWorkingDraft])

  const zoomBaseline = getFitBaselineZoom(working.rotation)
  const displayZoom = working.zoom / zoomBaseline
  const { min: displayZoomMin, max: displayZoomMax } =
    getDisplayZoomBounds(zoomBaseline)
  const displaySliderZoomMax = Math.min(
    Math.max(SLIDER_ZOOM_MAX, displayZoom),
    displayZoomMax
  )
  const autoCropTransform = autoCropResult
    ? resolveAutoCropTransform(
        item,
        autoCropResult,
        frameAspectRatio,
        working.rotation
      )
    : null
  const autoCropApplied =
    !!autoCropTransform && isSameItemTransform(working, autoCropTransform)
  const hasChanges =
    hasSavedTransform || !isSameItemTransform(working, fitBaseline)
  const useManualCrop =
    hasChanges || effectiveFit === 'cover' || !!item.aspectRatio
  const cropSize = useManualCrop
    ? resolveManualCropImageSize(
        item.aspectRatio,
        frameAspectRatio,
        working.rotation
      )
    : null
  const cropCss = useManualCrop ? itemTransformToCropCss(working) : null
  const imgClass = useManualCrop
    ? 'absolute max-w-none select-none'
    : `h-full w-full ${OBJECT_FIT_CLASS[effectiveFit]}`
  const imgStyle = useManualCrop
    ? {
        width: `${cropSize!.widthPercent}%`,
        height: `${cropSize!.heightPercent}%`,
        left: cropCss!.left,
        top: cropCss!.top,
        transform: cropCss!.transform,
        transformOrigin: 'center center' as const,
        pointerEvents: 'none' as const,
        willChange: 'transform' as const,
      }
    : { pointerEvents: 'none' as const }
  const ratioLabel = item.aspectRatio
    ? formatAspectRatio(item.aspectRatio)
    : '-'
  const mismatched = itemHasAspectMismatch(item, boardAspectRatio)
  const boardRatioLabel = formatAspectRatio(boardAspectRatio)
  const ratioBadgeClass = mismatched
    ? 'border-amber-300/50 bg-amber-300/10 text-amber-200'
    : 'border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] text-[var(--t-text-muted)]'
  const ratioBadgeActionableClass = mismatched
    ? 'cursor-pointer hover:border-amber-200 hover:bg-amber-300/20 active:bg-amber-300/30'
    : 'cursor-pointer hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-active)]'
  const ratioChipActionable =
    mismatched && !!autoCropHash && autoCropResult !== null && !autoCropApplied
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
        imageSectionId={imageSectionId}
        imageExpanded={imageExpanded}
        onImageExpandedChange={onImageExpandedChange}
        rotate={rotate}
        displayZoom={displayZoom}
        displayZoomMin={displayZoomMin}
        displaySliderZoomMax={displaySliderZoomMax}
        onZoomLiveChange={setZoomLive}
        centerOffsets={centerOffsets}
        working={working}
        autoCrop={autoCrop}
        autoCropHash={autoCropHash}
        autoCropping={autoCropping}
        autoCropResult={autoCropResult}
        autoCropApplied={autoCropApplied}
        reset={reset}
        hasChanges={hasChanges}
        isDirty={isDirty}
        canPrev={canPrev}
        canNext={canNext}
        canSkip={canSkip}
        onPrev={onPrev}
        onNext={onNext}
        onSkip={onSkip}
      />
    </div>
  )
})
