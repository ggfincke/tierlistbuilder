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
import {
  ChevronRight,
  Crop,
  Crosshair,
  RefreshCw,
  RotateCcw,
  RotateCw,
  SkipForward,
} from 'lucide-react'

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import type { TextStyleId } from '@tierlistbuilder/contracts/lib/theme'
import type {
  BoardLabelSettings,
  ImageFit,
  ItemLabelOptions,
  ItemRotation,
  ItemTransform,
  LabelOverlayPlacement,
  LabelPlacement,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import type { ItemSize } from '@tierlistbuilder/contracts/workspace/settings'
import {
  formatAspectRatio,
  getEffectiveImageFit,
  itemHasAspectMismatch,
} from '~/features/workspace/boards/lib/aspectRatio'
import {
  itemSlotDimensions,
  OBJECT_FIT_CLASS,
} from '~/shared/board-ui/constants'
import {
  resolveLabelLayout,
  type ResolvedLabelDisplay,
} from '~/shared/board-ui/labelDisplay'
import { CaptionStrip as SharedCaptionStrip } from '~/shared/board-ui/labelBlocks'
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
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import {
  applyAxisSnap,
  CANVAS_BOUND,
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
import { LABEL_FONT_LABELS } from '../lib/labelEditorOptions'
import { useMeasuredElementSize } from '../lib/useMeasuredElementSize'
import { AutoCropButton } from './AutoCropButton'
import { DraggableLabelOverlay } from './DraggableLabelOverlay'
import { LabelEditorRow } from './LabelEditorRow'
import { SaveStatusIndicator } from './SaveStatusIndicator'
import { ZoomSlider } from './ZoomSlider'

export interface PendingImageEditorPaneEdit
{
  id: ItemId
  transform: ItemTransform | null
}

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
  const labelLayout = useMemo(
    () =>
      resolveLabelLayout({
        itemOptions: item.labelOptions,
        boardSettings: boardLabels,
        globalShowLabels,
      }),
    [item.labelOptions, boardLabels, globalShowLabels]
  )
  const previewLabelText = item.label?.trim() ?? ''
  const showLivePreview = labelLayout.visible && previewLabelText.length > 0
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [labelDraft, setLabelDraft] = useState(item.label ?? '')
  const labelDraftRef = useRef(labelDraft)
  labelDraftRef.current = labelDraft

  useEffect(() =>
  {
    const nextDraft = item.label ?? ''
    labelDraftRef.current = nextDraft
    setLabelDraft(nextDraft)
  }, [item.id, item.label])

  const updateLabelDraft = useCallback((value: string) =>
  {
    labelDraftRef.current = value
    setLabelDraft(value)
  }, [])

  const commitLabel = useCallback(() =>
  {
    onLabelChange(labelDraftRef.current)
  }, [onLabelChange])

  const updateLabelOption = useCallback(
    <K extends keyof ItemLabelOptions>(
      key: K,
      value: ItemLabelOptions[K] | undefined
    ) =>
    {
      const current = item.labelOptions ?? {}
      const next: ItemLabelOptions = { ...current }
      if (value === undefined)
      {
        delete next[key]
      }
      else
      {
        next[key] = value
      }
      onLabelOptionsChange(Object.keys(next).length > 0 ? next : null)
    },
    [item.labelOptions, onLabelOptionsChange]
  )

  const [placementDraft, setPlacementDraft] =
    useState<LabelOverlayPlacement | null>(null)
  const placementDraftRef = useRef(placementDraft)
  placementDraftRef.current = placementDraft
  const [labelDragSnap, setLabelDragSnap] = useState<{
    x: boolean
    y: boolean
  }>({ x: false, y: false })

  const handleLabelDragMove = useCallback(
    (x: number, y: number, snap: { x: boolean; y: boolean }) =>
    {
      setPlacementDraft({ mode: 'overlay', x, y })
      setLabelDragSnap((prev) =>
        prev.x === snap.x && prev.y === snap.y ? prev : snap
      )
    },
    []
  )

  const handleLabelDragEnd = useCallback(() =>
  {
    const draft = placementDraftRef.current
    setLabelDragSnap({ x: false, y: false })
    if (!draft) return
    updateLabelOption('placement', draft)
    setPlacementDraft(null)
  }, [updateLabelOption])

  useEffect(() =>
  {
    setPlacementDraft(null)
    setLabelDragSnap({ x: false, y: false })
  }, [item.id])

  const handlePlacementChange = useCallback(
    (placement: LabelPlacement) =>
    {
      setPlacementDraft(null)
      updateLabelOption('placement', placement)
    },
    [updateLabelOption]
  )

  const resolvedPlacement: LabelPlacement =
    placementDraft ?? labelLayout.placement
  const captionPreviewMode =
    showLivePreview &&
    (resolvedPlacement.mode === 'captionAbove' ||
      resolvedPlacement.mode === 'captionBelow')
  const previewW =
    boardAspectRatio >= 1 ? CANVAS_BOUND : CANVAS_BOUND * boardAspectRatio
  const previewH =
    boardAspectRatio >= 1 ? CANVAS_BOUND / boardAspectRatio : CANVAS_BOUND
  const previewTileSize = itemSlotDimensions(boardItemSize, boardAspectRatio)
  const previewScale =
    previewTileSize.height > 0 ? previewH / previewTileSize.height : 1
  const previewLabelDisplay = useMemo<ResolvedLabelDisplay>(
    () => ({
      placement: resolvedPlacement,
      scrim: labelLayout.scrim,
      sizeScale: labelLayout.sizeScale,
      fontSizePx: labelLayout.fontSizePx * previewScale,
      textStyleId: labelLayout.textStyleId,
      textColor: labelLayout.textColor,
      text: previewLabelText,
    }),
    [
      resolvedPlacement,
      labelLayout.scrim,
      labelLayout.sizeScale,
      labelLayout.fontSizePx,
      labelLayout.textStyleId,
      labelLayout.textColor,
      previewScale,
      previewLabelText,
    ]
  )
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
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--t-bg-sunken)] p-6">
        <div
          className={`overflow-hidden rounded border border-[var(--t-border-secondary)] bg-black/20 select-none ${
            captionPreviewMode ? 'flex flex-col' : ''
          }`}
          style={{
            width: previewW,
            height: previewH,
          }}
        >
          {captionPreviewMode && resolvedPlacement.mode === 'captionAbove' && (
            <SharedCaptionStrip display={previewLabelDisplay} />
          )}
          <div
            ref={canvasRef}
            className={`relative overflow-hidden ${
              captionPreviewMode ? 'min-h-0 flex-1' : 'h-full w-full'
            }`}
            style={{
              cursor: isDragging ? 'grabbing' : url ? 'grab' : 'default',
              touchAction: 'none',
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            role="presentation"
          >
            {url ? (
              <img
                src={url}
                alt={item.altText ?? item.label ?? 'Tier item'}
                className={imgClass}
                style={imgStyle}
                draggable={false}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-[var(--t-text-faint)]">
                Loading...
              </div>
            )}
            {snap.x && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--t-accent)]"
              />
            )}
            {snap.y && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--t-accent)]"
              />
            )}
            {placementDraft && labelDragSnap.x && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--t-accent)]"
              />
            )}
            {placementDraft && labelDragSnap.y && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--t-accent)]"
              />
            )}
            {showLivePreview && resolvedPlacement.mode === 'overlay' && (
              <DraggableLabelOverlay
                display={previewLabelDisplay}
                canvasRef={canvasRef}
                onDragMove={handleLabelDragMove}
                onDragEnd={handleLabelDragEnd}
              />
            )}
          </div>
          {captionPreviewMode && resolvedPlacement.mode === 'captionBelow' && (
            <SharedCaptionStrip display={previewLabelDisplay} />
          )}
        </div>
      </div>
      <LabelEditorRow
        resolvedPlacement={resolvedPlacement}
        resolvedScrim={labelLayout.scrim}
        resolvedTextColor={labelLayout.textColor}
        resolvedFontSizePx={labelLayout.fontSizePx}
        resolvedTextStyleId={labelLayout.textStyleId}
        inheritedTextStyleLabel={
          LABEL_FONT_LABELS[boardLabels?.textStyleId ?? globalTextStyleId]
        }
        boardDefaultVisible={boardLabels?.show ?? globalShowLabels}
        itemOptions={item.labelOptions}
        onPlacementChange={handlePlacementChange}
        onScrimChange={(s) => updateLabelOption('scrim', s)}
        onTextColorChange={(c) => updateLabelOption('textColor', c)}
        onFontSizePxChange={(px) =>
        {
          const current = item.labelOptions ?? {}
          const next: ItemLabelOptions = { ...current }
          delete next.sizeScale
          if (px === undefined) delete next.fontSizePx
          else next.fontSizePx = px
          onLabelOptionsChange(Object.keys(next).length > 0 ? next : null)
        }}
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
      <div
        className="sticky bottom-0 flex flex-col gap-2 border-t border-[var(--t-border-secondary)] bg-[var(--t-bg-page)] px-5 py-3"
        role="group"
        aria-label="Image controls and navigation"
      >
        <button
          type="button"
          onClick={() => onImageExpandedChange(!imageExpanded)}
          aria-expanded={imageExpanded}
          aria-controls={imageSectionId}
          className="focus-custom inline-flex w-fit items-center gap-1 rounded px-1 py-0.5 text-[0.65rem] font-semibold tracking-wider text-[var(--t-text-faint)] uppercase hover:text-[var(--t-text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
          title={
            imageExpanded ? 'Collapse image controls' : 'Expand image controls'
          }
        >
          <ChevronRight
            className={`h-3 w-3 transition-transform ${imageExpanded ? 'rotate-90' : ''}`}
          />
          Image
        </button>
        {imageExpanded && (
          <div
            id={imageSectionId}
            className="flex flex-wrap items-center gap-3"
          >
            <div
              className="flex items-center gap-1"
              role="group"
              aria-label="Rotate"
            >
              <button
                type="button"
                onClick={() => rotate(-90)}
                className="focus-custom rounded p-1.5 text-[var(--t-text-muted)] hover:bg-[var(--t-bg-surface)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
                aria-label="Rotate left 90 degrees"
                title="Rotate 90 degrees counter-clockwise"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => rotate(90)}
                className="focus-custom rounded p-1.5 text-[var(--t-text-muted)] hover:bg-[var(--t-bg-surface)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
                aria-label="Rotate right 90 degrees"
                title="Rotate 90 degrees clockwise"
              >
                <RotateCw className="h-4 w-4" />
              </button>
            </div>
            <ZoomSlider
              value={displayZoom}
              min={displayZoomMin}
              sliderMax={displaySliderZoomMax}
              onLiveChange={setZoomLive}
            />
            <button
              type="button"
              onClick={centerOffsets}
              disabled={working.offsetX === 0 && working.offsetY === 0}
              className="focus-custom inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--t-text-muted)] enabled:hover:text-[var(--t-text)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
              aria-label="Center image"
              title="Center the image - clears the pan offset"
            >
              <Crosshair className="h-3 w-3" />
              Center
            </button>
            <AutoCropButton
              onClick={autoCrop}
              disabled={
                !autoCropHash ||
                autoCropping ||
                autoCropResult === null ||
                autoCropApplied
              }
              minWidthClassName="min-w-[7.5rem]"
              state={
                autoCropping ? 'running' : autoCropApplied ? 'applied' : 'idle'
              }
              variant="plain"
              labels={{
                running: 'Auto-crop',
                applied: 'Auto-cropped',
                idle: 'Auto-crop',
              }}
              ariaLabels={{
                running: 'Auto-cropping in progress',
                applied: 'Auto-crop applied to this image',
                idle: 'Auto-crop this image to detected content',
              }}
              title={
                autoCropApplied
                  ? 'Already auto-cropped - adjust or reset to re-run'
                  : autoCropResult === null
                    ? 'No crop detected'
                    : 'Frame the detected content'
              }
            />
            <button
              type="button"
              onClick={reset}
              disabled={!hasChanges && !isDirty}
              className="focus-custom inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--t-text-muted)] enabled:hover:text-[var(--t-text)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
              title="Reset rotation, zoom, and pan to the default fit"
              aria-label="Reset image transforms (rotation, zoom, pan)"
            >
              <RefreshCw className="h-3 w-3" />
              Reset image
            </button>
          </div>
        )}
        <div
          className="flex flex-wrap items-center gap-3"
          role="group"
          aria-label="Navigation"
        >
          <span
            className="text-[0.65rem] font-semibold tracking-wider text-[var(--t-text-faint)] uppercase"
            aria-hidden="true"
          >
            Navigate
          </span>
          <div className="ml-auto flex items-center gap-2">
            <SecondaryButton
              onClick={onPrev}
              disabled={!canPrev}
              variant="surface"
              size="sm"
              title="Previous item"
            >
              Prev
            </SecondaryButton>
            <SecondaryButton
              onClick={onSkip}
              disabled={!canSkip}
              variant="outline"
              size="sm"
              title="Leave this item as-is and move on"
            >
              <span className="inline-flex items-center gap-1">
                <SkipForward className="h-3 w-3" />
                Skip
              </span>
            </SecondaryButton>
            <SecondaryButton
              onClick={onNext}
              disabled={!canNext}
              variant="surface"
              size="sm"
              title="Next item"
            >
              Next
            </SecondaryButton>
          </div>
        </div>
      </div>
    </div>
  )
})
