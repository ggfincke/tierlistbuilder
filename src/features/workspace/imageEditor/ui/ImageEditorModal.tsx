// src/features/workspace/imageEditor/ui/ImageEditorModal.tsx
// master-detail editor for per-item rotation, zoom, & pan transforms; crop
// frame mirrors the rendered board item image area

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
  type RefObject,
} from 'react'
import {
  Check,
  ChevronRight,
  Crop,
  Crosshair,
  EyeOff,
  Loader2,
  Pause,
  RefreshCw,
  RotateCcw,
  RotateCw,
  SkipForward,
  Wand2,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import type {
  BoardLabelSettings,
  ImageFit,
  ItemLabelOptions,
  ItemRotation,
  ItemTransform,
  LabelOverlayPlacement,
  LabelPlacement,
  LabelPlacementMode,
  LabelScrim,
  LabelTextColor,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  ITEM_TRANSFORM_IDENTITY,
  ITEM_TRANSFORM_LIMITS,
  LABEL_FONT_SIZE_PX_MAX,
  LABEL_FONT_SIZE_PX_MIN,
  LABEL_PLACEMENT_DEFAULT,
  LABEL_PLACEMENT_OVERLAY_PRESETS,
  LABEL_TEXT_COLORS,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  TEXT_STYLE_IDS,
  type TextStyleId,
} from '@tierlistbuilder/contracts/lib/theme'
import type { ItemSize } from '@tierlistbuilder/contracts/workspace/settings'
import {
  resolveLabelLayout,
  type ResolvedLabelDisplay,
} from '~/shared/board-ui/labelDisplay'
import {
  resolveEffectiveShowLabels,
  withBoardShowLabels,
} from '~/shared/board-ui/labelSettings'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import {
  formatAspectRatio,
  getBoardItemAspectRatio,
  getEffectiveImageFit,
  itemHasAspectMismatch,
  type RatioOption,
} from '~/features/workspace/boards/lib/aspectRatio'
import {
  itemSlotDimensions,
  OBJECT_FIT_CLASS,
} from '~/shared/board-ui/constants'
import { ItemContent } from '~/shared/board-ui/ItemContent'
import {
  CaptionStrip as SharedCaptionStrip,
  OverlayLabelBlock as SharedOverlayLabelBlock,
} from '~/shared/board-ui/labelBlocks'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useBoardAspectRatioPicker } from '~/features/workspace/settings/model/useBoardAspectRatioPicker'
import {
  AspectRatioChips,
  CustomRatioInput,
} from '~/features/workspace/settings/ui/AspectRatioPicker'
import { useImageUrl } from '~/shared/hooks/useImageUrl'
import {
  clampItemTransform,
  isIdentityTransform,
  isSameItemTransform,
  itemTransformToCropCss,
  resolveManualCropFitZoom,
  resolveManualCropImageSize,
} from '~/shared/lib/imageTransform'
import {
  ceilToStep,
  clamp,
  floorToStep,
  parsePercentInput,
  roundToStep,
} from '~/shared/lib/math'
import {
  areCachedAutoCropsApplied,
  collectAutoCropTransforms,
  detectContentBBox,
  getAutoCropCacheVersion,
  getAutoCropHash,
  getCachedBBox,
  loadAutoCropBlob,
  resolveAutoCropTransform,
  subscribeAutoCropCache,
} from '~/shared/lib/autoCrop'
import { warmImageHashes } from '~/shared/images/imageBlobCache'
import { useAutoCropTrimShadows } from '~/features/workspace/settings/model/useAutoCropTrimShadows'
import { AutoCropTrimToggle } from '~/features/workspace/settings/ui/AutoCropTrimToggle'
import { ShowLabelsToggle } from '~/features/workspace/settings/ui/ShowLabelsToggle'
import {
  getUndoRedoShortcut,
  isEditableShortcutTarget,
} from '~/features/workspace/shortcuts/model/undoRedoShortcut'
import { BaseModal } from '~/shared/overlay/BaseModal'
import { ConfirmDialog } from '~/shared/overlay/ConfirmDialog'
import { ModalHeader } from '~/shared/overlay/ModalHeader'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { toast } from '~/shared/notifications/useToastStore'
import {
  useImageEditorStore,
  type ImageEditorFilter,
} from '../model/useImageEditorStore'

const FILTER_OPTIONS: { value: ImageEditorFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'mismatched', label: 'Mismatched' },
  { value: 'adjusted', label: 'Adjusted' },
]

// preview canvas long-edge in px; the short edge is derived from board ratio
const CANVAS_BOUND = 420
const RAIL_THUMBNAIL_BOUND = 36

// display-zoom bounds for the slider & percent input (independent of the
// per-item baseline, so the UI floor/ceiling stay at 1% / 250%)
const SLIDER_ZOOM_MIN = 0.01
const SLIDER_ZOOM_MAX = 2.5
const ZOOM_SLIDER_STEP = 0.01

const PAN_START_THRESHOLD_PX = 4
// snap (center & image-edge) bypassed when Alt is held; threshold per axis.
// edge candidates are only valid when the image overhangs the canvas on
// that axis — otherwise edge alignment & center coincide
const PAN_SNAP_THRESHOLD_PX = 5
const WHEEL_ZOOM_SENSITIVITY = 0.0015

interface AxisSnapCandidate
{
  value: number
  guide: boolean
}

const applyAxisSnap = (
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

const normalizeRotation = (raw: number): ItemRotation =>
{
  const wrapped = (((raw % 360) + 360) % 360) as ItemRotation
  return wrapped
}

const createFitBaselineTransform = (
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

const getSavedTransform = (item: TierItem): ItemTransform | undefined =>
  item.transform && !isIdentityTransform(item.transform)
    ? item.transform
    : undefined

const seedTransform = (
  item: TierItem,
  boardAspectRatio: number,
  fit: ImageFit
): ItemTransform =>
  getSavedTransform(item) ??
  createFitBaselineTransform(item, boardAspectRatio, fit)

const boundedAspectSize = (
  aspectRatio: number,
  bound: number
): { width: number; height: number } =>
{
  const safeRatio = aspectRatio > 0 ? aspectRatio : 1
  return safeRatio >= 1
    ? { width: bound, height: bound / safeRatio }
    : { width: bound * safeRatio, height: bound }
}

interface ElementSize
{
  width: number
  height: number
}

const useMeasuredElementSize = <T extends HTMLElement>(
  ref: RefObject<T | null>,
  fallback: ElementSize
): ElementSize =>
{
  const fallbackWidth = fallback.width
  const fallbackHeight = fallback.height
  const [size, setSize] = useState(() => ({
    width: fallbackWidth,
    height: fallbackHeight,
  }))

  useEffect(() =>
  {
    const element = ref.current
    if (!element)
    {
      return
    }

    const update = () =>
    {
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      setSize((current) =>
        Math.abs(current.width - rect.width) < 0.5 &&
        Math.abs(current.height - rect.height) < 0.5
          ? current
          : { width: rect.width, height: rect.height }
      )
    }

    update()

    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, fallbackWidth, fallbackHeight])

  return size
}

interface PendingImageEditorPaneEdit
{
  id: ItemId
  transform: ItemTransform | null
}

interface ImageEditorPaneHandle
{
  getPendingEdit: () => PendingImageEditorPaneEdit | null
  flushPendingEdit: () => void
}

const getDisplayZoomBounds = (
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

const isInteractiveArrowTarget = (target: EventTarget | null): boolean =>
{
  if (!(target instanceof Element)) return false
  if (target instanceof HTMLElement && target.isContentEditable) return true
  return (
    target.closest(
      'button,input,textarea,select,[contenteditable="true"],[role="button"],[role="radio"],[role="tab"],[role="switch"],[role="slider"],[role="menuitem"],[role="option"]'
    ) !== null
  )
}

export const ImageEditorModal = () =>
{
  const isOpen = useImageEditorStore((s) => s.isOpen)
  if (!isOpen) return null
  return <ImageEditorModalBody />
}

const ImageEditorModalBody = () =>
{
  const titleId = useId()
  const { filter, setFilter, initialItemId, close } = useImageEditorStore(
    useShallow((s) => ({
      filter: s.filter,
      setFilter: s.setFilter,
      initialItemId: s.initialItemId,
      close: s.close,
    }))
  )
  const {
    items,
    tiers,
    unrankedItemIds,
    boardAspectRatio,
    setItemTransform,
    setItemsTransform,
    boardDefaultFit,
    boardLabels,
    setBoardLabelSettings,
    setItemLabelOptions,
    setBoardAndItemsLabelOptions,
    setItemLabel,
  } = useActiveBoardStore(
    useShallow((s) => ({
      items: s.items,
      tiers: s.tiers,
      unrankedItemIds: s.unrankedItemIds,
      boardAspectRatio: getBoardItemAspectRatio(s),
      setItemTransform: s.setItemTransform,
      setItemsTransform: s.setItemsTransform,
      boardDefaultFit: s.defaultItemImageFit,
      boardLabels: s.labels,
      setBoardLabelSettings: s.setBoardLabelSettings,
      setItemLabelOptions: s.setItemLabelOptions,
      setBoardAndItemsLabelOptions: s.setBoardAndItemsLabelOptions,
      setItemLabel: s.setItemLabel,
    }))
  )
  const globalShowLabels = useSettingsStore((s) => s.showLabels)
  const globalTextStyleId = useSettingsStore((s) => s.textStyleId)
  // user's tile-size preference; preview scales label rendering to match
  // tile-relative proportions instead of looking tiny in the larger canvas
  const boardItemSize = useSettingsStore((s) => s.itemSize)
  const effectiveShowLabels = resolveEffectiveShowLabels(
    boardLabels,
    globalShowLabels
  )
  const handleShowLabelsChange = useCallback(
    (show: boolean) =>
    {
      setBoardLabelSettings(withBoardShowLabels(boardLabels, show))
    },
    [boardLabels, setBoardLabelSettings]
  )
  const ratioPicker = useBoardAspectRatioPicker()
  const { trimSoftShadows, setTrimSoftShadows } = useAutoCropTrimShadows()
  // caption / image row collapse state — lifted so both survive item
  // navigation within the modal session; defaults to collapsed. nav row
  // (Prev/Skip/Next) stays always-visible regardless of image collapse
  const [captionExpanded, setCaptionExpanded] = useState(false)
  const [imageExpanded, setImageExpanded] = useState(false)
  const activePaneRef = useRef<ImageEditorPaneHandle | null>(null)

  const allImageItems = useMemo(() =>
  {
    const result: TierItem[] = []
    const seen = new Set<ItemId>()
    const visitId = (id: ItemId): void =>
    {
      if (seen.has(id)) return
      seen.add(id)
      const item = items[id]
      if (item?.imageRef) result.push(item)
    }

    for (const tier of tiers)
    {
      for (const id of tier.itemIds) visitId(id)
    }
    for (const id of unrankedItemIds) visitId(id)

    return result
  }, [items, tiers, unrankedItemIds])

  const [autoCropProgress, setAutoCropProgress] = useState<{
    running: boolean
    done: number
    total: number
  }>({ running: false, done: 0, total: 0 })
  const autoCropCacheVersion = useSyncExternalStore(
    subscribeAutoCropCache,
    getAutoCropCacheVersion,
    getAutoCropCacheVersion
  )

  const filteredItems = useMemo(() =>
  {
    if (filter === 'mismatched')
    {
      return allImageItems.filter((it) =>
        itemHasAspectMismatch(it, boardAspectRatio)
      )
    }
    if (filter === 'adjusted')
    {
      return allImageItems.filter(
        (it) => !!it.transform && !isIdentityTransform(it.transform)
      )
    }
    return allImageItems
  }, [filter, allImageItems, boardAspectRatio])

  const getItemsWithPendingEdit = useCallback(
    (pendingEdit: PendingImageEditorPaneEdit | null): readonly TierItem[] =>
    {
      if (!pendingEdit) return filteredItems
      let matched = false
      const nextItems = filteredItems.map((it) =>
      {
        if (it.id !== pendingEdit.id) return it
        matched = true
        return {
          ...it,
          transform: pendingEdit.transform ?? undefined,
        }
      })
      return matched ? nextItems : filteredItems
    },
    [filteredItems]
  )

  // auto-crop scope tracks the visible filter so cropping done in the issue
  // modal (mismatched-only) carries over to the Mismatched view here
  const handleAutoCropAll = useCallback(
    async (sourceItems: readonly TierItem[] = filteredItems) =>
    {
      const targets = sourceItems.filter((it) => !!getAutoCropHash(it))
      if (targets.length === 0) return
      setAutoCropProgress({ running: true, done: 0, total: targets.length })
      try
      {
        const entries = await collectAutoCropTransforms({
          targets,
          boardAspectRatio,
          trimSoftShadows,
          onProgress: () =>
            setAutoCropProgress((p) =>
              p.running ? { ...p, done: p.done + 1 } : p
            ),
        })
        if (entries.length > 0) setItemsTransform(entries)
      }
      finally
      {
        setAutoCropProgress({ running: false, done: 0, total: 0 })
      }
    },
    [trimSoftShadows, filteredItems, boardAspectRatio, setItemsTransform]
  )

  const autoCropAllApplied = useMemo(() =>
  {
    void autoCropCacheVersion
    if (autoCropProgress.running) return false
    return areCachedAutoCropsApplied(
      filteredItems,
      boardAspectRatio,
      trimSoftShadows
    )
  }, [
    autoCropCacheVersion,
    autoCropProgress.running,
    boardAspectRatio,
    filteredItems,
    trimSoftShadows,
  ])

  // items the user (or a previous gesture) saved a transform on that doesn't
  // match the cached auto-crop result — bulk auto-crop would overwrite them
  const manuallyAdjustedTargets = useMemo(() =>
  {
    void autoCropCacheVersion
    return filteredItems.filter(
      (it) =>
        !!it.transform &&
        !isIdentityTransform(it.transform) &&
        !areCachedAutoCropsApplied([it], boardAspectRatio, trimSoftShadows)
    )
  }, [autoCropCacheVersion, boardAspectRatio, filteredItems, trimSoftShadows])

  const getPendingManualTarget = useCallback(
    (pendingEdit: PendingImageEditorPaneEdit | null): TierItem | null =>
    {
      if (!pendingEdit) return null
      const item = filteredItems.find((it) => it.id === pendingEdit.id)
      if (!item || !getAutoCropHash(item)) return null
      const pendingItem: TierItem = {
        ...item,
        transform: pendingEdit.transform ?? undefined,
      }
      return areCachedAutoCropsApplied(
        [pendingItem],
        boardAspectRatio,
        trimSoftShadows
      )
        ? null
        : pendingItem
    },
    [filteredItems, boardAspectRatio, trimSoftShadows]
  )

  const getManualAdjustmentCount = useCallback(
    (pendingEdit: PendingImageEditorPaneEdit | null): number =>
    {
      const pendingTarget = getPendingManualTarget(pendingEdit)
      if (
        !pendingTarget ||
        manuallyAdjustedTargets.some((it) => it.id === pendingTarget.id)
      )
      {
        return manuallyAdjustedTargets.length
      }
      return manuallyAdjustedTargets.length + 1
    },
    [getPendingManualTarget, manuallyAdjustedTargets]
  )

  const [confirmAutoCropOpen, setConfirmAutoCropOpen] = useState(false)
  const [confirmAutoCropCount, setConfirmAutoCropCount] = useState(0)
  const flushActivePaneEdit = useCallback(() =>
  {
    activePaneRef.current?.flushPendingEdit()
  }, [])

  // 'Apply to all items' writes the current item's resolved label settings
  // as board defaults & clears stale per-item labelOptions board-wide
  const [confirmApplyLabelOpen, setConfirmApplyLabelOpen] = useState(false)
  const [pendingApplyLabelSourceId, setPendingApplyLabelSourceId] =
    useState<ItemId | null>(null)
  const [confirmApplyLabelCount, setConfirmApplyLabelCount] = useState(0)

  // changing the board ratio reflows every item — guard the click w/ a
  // confirm when hand-tuned crops on the board are at risk
  const [confirmRatioOpen, setConfirmRatioOpen] = useState(false)
  const [pendingRatioAction, setPendingRatioAction] = useState<
    (() => void) | null
  >(null)
  const [confirmRatioCount, setConfirmRatioCount] = useState(0)
  const getBoardWideAdjustedCount = useCallback(
    (pendingEdit: PendingImageEditorPaneEdit | null): number =>
      allImageItems.reduce((n, it) =>
      {
        const transform =
          pendingEdit?.id === it.id
            ? (pendingEdit.transform ?? undefined)
            : it.transform
        return n + (transform && !isIdentityTransform(transform) ? 1 : 0)
      }, 0),
    [allImageItems]
  )
  const guardRatioAction = useCallback(
    (run: () => void) =>
    {
      const pendingEdit = activePaneRef.current?.getPendingEdit() ?? null
      const adjustedCount = getBoardWideAdjustedCount(pendingEdit)
      const runAfterFlush = () =>
      {
        flushActivePaneEdit()
        run()
      }
      if (adjustedCount === 0)
      {
        runAfterFlush()
        return
      }
      setConfirmRatioCount(adjustedCount)
      setPendingRatioAction(() => runAfterFlush)
      setConfirmRatioOpen(true)
    },
    [flushActivePaneEdit, getBoardWideAdjustedCount]
  )

  const handleRatioOption = useCallback(
    (option: RatioOption) =>
    {
      // changing only the picker mode (open Custom inputs) doesn't reflow
      // anything — only gate when an actual value/mode change applies
      if (option.kind === 'custom')
      {
        ratioPicker.handleOption(option)
        return
      }
      guardRatioAction(() => ratioPicker.handleOption(option))
    },
    [guardRatioAction, ratioPicker]
  )

  const handleApplyCustomRatio = useCallback(() =>
  {
    guardRatioAction(() => ratioPicker.applyCustom())
  }, [guardRatioAction, ratioPicker])

  const confirmRatioChange = useCallback(() =>
  {
    pendingRatioAction?.()
    setPendingRatioAction(null)
    setConfirmRatioCount(0)
    setConfirmRatioOpen(false)
  }, [pendingRatioAction])

  const cancelRatioChange = useCallback(() =>
  {
    setPendingRatioAction(null)
    setConfirmRatioCount(0)
    setConfirmRatioOpen(false)
  }, [])

  // gate the bulk run on a confirm when manual adjustments are at risk;
  // skip the prompt when nothing meaningful would be overwritten
  const requestAutoCropAll = useCallback(() =>
  {
    const pendingEdit = activePaneRef.current?.getPendingEdit() ?? null
    const adjustmentCount = getManualAdjustmentCount(pendingEdit)
    if (adjustmentCount > 0)
    {
      setConfirmAutoCropCount(adjustmentCount)
      setConfirmAutoCropOpen(true)
      return
    }
    const cropItems = getItemsWithPendingEdit(pendingEdit)
    flushActivePaneEdit()
    void handleAutoCropAll(cropItems)
  }, [
    getItemsWithPendingEdit,
    getManualAdjustmentCount,
    flushActivePaneEdit,
    handleAutoCropAll,
  ])

  const confirmAutoCropAll = useCallback(() =>
  {
    const pendingEdit = activePaneRef.current?.getPendingEdit() ?? null
    const cropItems = getItemsWithPendingEdit(pendingEdit)
    setConfirmAutoCropOpen(false)
    setConfirmAutoCropCount(0)
    flushActivePaneEdit()
    void handleAutoCropAll(cropItems)
  }, [getItemsWithPendingEdit, flushActivePaneEdit, handleAutoCropAll])

  // resolves the current source item's effective label settings, writes them
  // as the new board defaults, & clears every other item's per-item override
  // so the whole board ends up matching the source's appearance
  const applyLabelToAllNow = useCallback(
    (sourceId: ItemId) =>
    {
      const source = items[sourceId]
      if (!source) return
      const layout = resolveLabelLayout({
        itemOptions: source.labelOptions,
        boardSettings: boardLabels,
        globalShowLabels,
      })
      const nextBoardLabels: BoardLabelSettings = {
        show: layout.visible,
        placement: layout.placement,
        scrim: layout.scrim,
        fontSizePx: layout.fontSizePx,
        textStyleId: layout.textStyleId,
        ...(layout.textColor !== 'auto' ? { textColor: layout.textColor } : {}),
      }
      // clearing source too — its visible result is already encoded in the
      // new board defaults, so it stays visually identical w/o per-item state
      const clearEntries = allImageItems
        .filter((it) => !!it.labelOptions)
        .map((it) => ({ id: it.id, options: null }))
      setBoardAndItemsLabelOptions(nextBoardLabels, clearEntries)
    },
    [
      items,
      allImageItems,
      boardLabels,
      globalShowLabels,
      setBoardAndItemsLabelOptions,
    ]
  )

  // count of items that will visibly change — others w/ per-item
  // overrides. source is skipped (its appearance is encoded in the new defaults)
  const countItemsThatWillChange = useCallback(
    (sourceId: ItemId): number =>
    {
      const source = items[sourceId]
      if (!source) return 0
      let count = 0
      for (const it of allImageItems)
      {
        if (it.id === sourceId) continue
        if (it.labelOptions) count += 1
      }
      return count
    },
    [items, allImageItems]
  )

  // gate the broadcast on a confirm when other items would lose their
  // per-tile overrides; skip the prompt when nothing is at risk (pure
  // board-default write w/ no per-item state to clear)
  const requestApplyLabelToAll = useCallback(
    (sourceId: ItemId) =>
    {
      const atRisk = countItemsThatWillChange(sourceId)
      if (atRisk === 0)
      {
        applyLabelToAllNow(sourceId)
        return
      }
      setConfirmApplyLabelCount(atRisk)
      setPendingApplyLabelSourceId(sourceId)
      setConfirmApplyLabelOpen(true)
    },
    [applyLabelToAllNow, countItemsThatWillChange]
  )

  const confirmApplyLabelToAll = useCallback(() =>
  {
    if (pendingApplyLabelSourceId) applyLabelToAllNow(pendingApplyLabelSourceId)
    setPendingApplyLabelSourceId(null)
    setConfirmApplyLabelOpen(false)
    setConfirmApplyLabelCount(0)
  }, [applyLabelToAllNow, pendingApplyLabelSourceId])

  const cancelApplyLabelToAll = useCallback(() =>
  {
    setPendingApplyLabelSourceId(null)
    setConfirmApplyLabelOpen(false)
    setConfirmApplyLabelCount(0)
  }, [])

  // user's explicit pick; falls back to the filter's first item when stale
  const [pickedId, setPickedId] = useState<ItemId | null>(() =>
  {
    if (initialItemId && allImageItems.some((it) => it.id === initialItemId))
    {
      return initialItemId
    }
    return null
  })

  const selectedIndex = useMemo(() =>
  {
    if (pickedId)
    {
      const idx = filteredItems.findIndex((it) => it.id === pickedId)
      if (idx >= 0) return idx
    }
    return filteredItems.length > 0 ? 0 : -1
  }, [pickedId, filteredItems])

  const selectedItem =
    selectedIndex >= 0 ? filteredItems[selectedIndex] : undefined
  const selectedId = selectedItem?.id ?? null

  const goPrev = useCallback(() =>
  {
    if (selectedIndex <= 0) return
    setPickedId(filteredItems[selectedIndex - 1].id)
  }, [selectedIndex, filteredItems])

  // session-only "deferred" set — Skip marks an item so the rail surfaces it
  // & Smart Next won't loop back. cleared on commit of a real transform
  const [skippedIds, setSkippedIds] = useState<ReadonlySet<ItemId>>(
    () => new Set()
  )

  const isSkipped = useCallback(
    (id: ItemId) => skippedIds.has(id),
    [skippedIds]
  )

  // raw forward navigation — Skip uses this; also the fallback when no
  // smarter "needs attention" target is left. Skip additionally tags the
  // current item as deferred so the rail can surface it
  const goSkip = useCallback(() =>
  {
    if (selectedIndex < 0 || selectedIndex >= filteredItems.length - 1) return
    const currentId = filteredItems[selectedIndex].id
    setSkippedIds((prev) =>
    {
      if (prev.has(currentId)) return prev
      const next = new Set(prev)
      next.add(currentId)
      return next
    })
    setPickedId(filteredItems[selectedIndex + 1].id)
  }, [selectedIndex, filteredItems])

  // smart Next: in Mismatched filter, hop to the next un-adjusted &
  // non-deferred item. clicking the row in the rail is how to revisit a skip
  const goNext = useCallback(() =>
  {
    if (selectedIndex < 0 || selectedIndex >= filteredItems.length - 1) return
    if (filter === 'mismatched')
    {
      for (let i = selectedIndex + 1; i < filteredItems.length; i += 1)
      {
        const it = filteredItems[i]
        if (skippedIds.has(it.id)) continue
        if (!it.transform || isIdentityTransform(it.transform))
        {
          setPickedId(it.id)
          return
        }
      }
    }
    setPickedId(filteredItems[selectedIndex + 1].id)
  }, [filter, selectedIndex, filteredItems, skippedIds])

  const handleCommit = useCallback(
    (id: ItemId, transform: ItemTransform | null) =>
    {
      setItemTransform(id, transform)
      // committing a real adjustment clears the deferred flag — the user
      // came back to fix it, so the rail shouldn't keep nagging
      if (transform)
      {
        setSkippedIds((prev) =>
        {
          if (!prev.has(id)) return prev
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    },
    [setItemTransform]
  )

  // editor-scoped shortcuts: [ Prev / ] Next / S Skip / Cmd-Z undo /
  // Cmd-Shift-Z or Cmd-Y redo. global hook bails while a modal is open,
  // so undo/redo run here & skip text fields to preserve native input undo
  useEffect(() =>
  {
    const onKey = (e: KeyboardEvent) =>
    {
      if (e.defaultPrevented) return

      const undoRedoShortcut = getUndoRedoShortcut(e)

      if (undoRedoShortcut)
      {
        if (isEditableShortcutTarget(e.target)) return
        e.preventDefault()
        flushActivePaneEdit()
        const result =
          undoRedoShortcut === 'undo'
            ? useActiveBoardStore.getState().undo()
            : useActiveBoardStore.getState().redo()
        if (result)
        {
          toast(
            `${undoRedoShortcut === 'undo' ? 'Undid' : 'Redid'} ${result.label.toLowerCase()}`
          )
        }
        return
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isInteractiveArrowTarget(e.target)) return
      if (e.key === '[')
      {
        e.preventDefault()
        goPrev()
        return
      }
      if (e.key === ']')
      {
        e.preventDefault()
        goNext()
        return
      }
      if (e.key === 's' || e.key === 'S')
      {
        e.preventDefault()
        goSkip()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flushActivePaneEdit, goPrev, goNext, goSkip])

  return (
    <BaseModal
      open
      onClose={close}
      labelledBy={titleId}
      panelClassName="flex flex-col p-0"
      panelStyle={{
        height: 'min(880px, calc(100dvh - 4rem))',
        maxWidth: 'none',
        overflowY: 'hidden',
        width: 'min(1120px, calc(100vw - 4rem))',
      }}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--t-border-secondary)] px-5 py-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <ModalHeader titleId={titleId}>Adjust items to fit board</ModalHeader>
          {selectedIndex >= 0 && filteredItems.length > 0 && (
            <span
              className="text-xs tabular-nums text-[var(--t-text-faint)]"
              aria-live="polite"
              title={
                filter === 'all'
                  ? 'Position in the full image-item list'
                  : `Position within the "${filter === 'mismatched' ? 'Mismatched' : 'Adjusted'}" filter — switch to All to see every image`
              }
            >
              Item {selectedIndex + 1} of {filteredItems.length}
              {filter !== 'all' && (
                <span className="ml-1 text-[var(--t-text-faint)]">
                  {filter === 'mismatched' ? 'mismatched' : 'adjusted'}
                </span>
              )}
            </span>
          )}
        </div>
        <SecondaryButton
          onClick={close}
          variant="surface"
          size="sm"
          title="Close — all changes are saved automatically"
        >
          Close
        </SecondaryButton>
      </div>
      <BoardControlsBar
        ratioPicker={ratioPicker}
        onRatioOption={handleRatioOption}
        onApplyCustomRatio={handleApplyCustomRatio}
        onAutoCropAll={requestAutoCropAll}
        autoCropProgress={autoCropProgress}
        autoCropAllApplied={autoCropAllApplied}
        trimSoftShadows={trimSoftShadows}
        onTrimSoftShadowsChange={setTrimSoftShadows}
        showLabels={effectiveShowLabels}
        onShowLabelsChange={handleShowLabelsChange}
      />
      <div className="flex min-h-0 flex-1">
        <ImageEditorRail
          filter={filter}
          onFilterChange={setFilter}
          items={filteredItems}
          totalCount={allImageItems.length}
          boardAspectRatio={boardAspectRatio}
          boardDefaultFit={boardDefaultFit}
          boardLabels={boardLabels}
          globalShowLabels={globalShowLabels}
          selectedId={selectedId}
          onSelect={setPickedId}
          isSkipped={isSkipped}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          {selectedItem ? (
            <ImageEditorPane
              ref={activePaneRef}
              key={`${selectedItem.id}:${boardAspectRatio}:${getEffectiveImageFit(selectedItem, boardDefaultFit)}`}
              item={selectedItem}
              boardAspectRatio={boardAspectRatio}
              boardDefaultFit={boardDefaultFit}
              trimSoftShadows={trimSoftShadows}
              boardLabels={boardLabels}
              globalShowLabels={globalShowLabels}
              globalTextStyleId={globalTextStyleId}
              boardItemSize={boardItemSize}
              onCommit={(t) => handleCommit(selectedItem.id, t)}
              onLabelChange={(label) => setItemLabel(selectedItem.id, label)}
              onLabelOptionsChange={(opts) =>
                setItemLabelOptions(selectedItem.id, opts)
              }
              onApplyLabelToAll={() => requestApplyLabelToAll(selectedItem.id)}
              canApplyLabelToAll={allImageItems.length > 1}
              labelAppliedToAll={allImageItems.every((it) => !it.labelOptions)}
              applyLabelToAllTitle={
                allImageItems.length > 1
                  ? `Use this item's label settings as the board default and clear per-tile overrides on ${allImageItems.length - 1} other ${
                      allImageItems.length === 2 ? 'item' : 'items'
                    }`
                  : 'No other image items on the board'
              }
              captionExpanded={captionExpanded}
              onCaptionExpandedChange={setCaptionExpanded}
              imageExpanded={imageExpanded}
              onImageExpandedChange={setImageExpanded}
              canPrev={selectedIndex > 0}
              canNext={
                selectedIndex >= 0 && selectedIndex < filteredItems.length - 1
              }
              canSkip={
                selectedIndex >= 0 && selectedIndex < filteredItems.length - 1
              }
              onPrev={goPrev}
              onNext={goNext}
              onSkip={goSkip}
            />
          ) : (
            <EmptyState totalCount={allImageItems.length} filter={filter} />
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmAutoCropOpen}
        title="Overwrite image adjustments?"
        description={`Auto-crop will replace ${confirmAutoCropCount === 1 ? '1 saved or pending adjustment' : `${confirmAutoCropCount} saved or pending adjustments`} in this view. Items already auto-cropped or untouched stay as they are.`}
        confirmText="Auto-crop all"
        variant="accent"
        onConfirm={confirmAutoCropAll}
        onCancel={() =>
        {
          setConfirmAutoCropCount(0)
          setConfirmAutoCropOpen(false)
        }}
      />
      <ConfirmDialog
        open={confirmRatioOpen}
        title="Change board ratio?"
        description={`This will reflow every item to the new ratio. ${
          confirmRatioCount === 1
            ? '1 item has a manual crop'
            : `${confirmRatioCount} items have manual crops`
        } that may need re-checking.`}
        confirmText="Change ratio"
        cancelText="Keep current"
        variant="accent"
        onConfirm={confirmRatioChange}
        onCancel={cancelRatioChange}
      />
      <ConfirmDialog
        open={confirmApplyLabelOpen}
        title="Apply label settings to all items?"
        description={`This sets the board default label settings to match this item, and clears per-tile label overrides on ${
          confirmApplyLabelCount === 1
            ? '1 other item'
            : `${confirmApplyLabelCount} other items`
        }. The board's text content stays per-item.`}
        confirmText="Apply to all"
        cancelText="Cancel"
        variant="accent"
        onConfirm={confirmApplyLabelToAll}
        onCancel={cancelApplyLabelToAll}
      />
    </BaseModal>
  )
}

interface BoardControlsBarProps
{
  ratioPicker: ReturnType<typeof useBoardAspectRatioPicker>
  // intercepted ratio handlers — guard reflow w/ a confirm when the
  // board has hand-tuned crops at risk
  onRatioOption: (option: RatioOption) => void
  onApplyCustomRatio: () => void
  onAutoCropAll: () => void
  autoCropProgress: { running: boolean; done: number; total: number }
  autoCropAllApplied: boolean
  trimSoftShadows: boolean
  onTrimSoftShadowsChange: (trim: boolean) => void
  showLabels: boolean
  onShowLabelsChange: (show: boolean) => void
}

// board-wide controls — board ratio chips plus crop actions for the editor
const BoardControlsBar = ({
  ratioPicker,
  onRatioOption,
  onApplyCustomRatio,
  onAutoCropAll,
  autoCropProgress,
  autoCropAllApplied,
  trimSoftShadows,
  onTrimSoftShadowsChange,
  showLabels,
  onShowLabelsChange,
}: BoardControlsBarProps) => (
  <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--t-border-secondary)] bg-[var(--t-bg-page)] px-5 py-2">
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-[var(--t-text-muted)]">
        Board ratio
      </span>
      <AspectRatioChips
        selectedOption={ratioPicker.selectedOption}
        onSelect={onRatioOption}
        autoRatio={ratioPicker.autoRatio}
        customRatioValue={ratioPicker.boardAspectRatio}
      />
      {ratioPicker.customOpen && (
        <CustomRatioInput
          width={ratioPicker.customWidth}
          height={ratioPicker.customHeight}
          onWidthChange={ratioPicker.setCustomWidth}
          onHeightChange={ratioPicker.setCustomHeight}
          onApply={onApplyCustomRatio}
          canApply={ratioPicker.canApplyCustom}
        />
      )}
    </div>
    <div className="flex flex-wrap items-center justify-end gap-2">
      <ShowLabelsToggle checked={showLabels} onChange={onShowLabelsChange} />
      <AutoCropTrimToggle
        checked={trimSoftShadows}
        onChange={onTrimSoftShadowsChange}
        disabled={autoCropProgress.running}
      />
      <AutoCropButton
        onClick={onAutoCropAll}
        disabled={autoCropProgress.running || autoCropAllApplied}
        minWidthClassName="min-w-[8.75rem]"
        state={
          autoCropProgress.running
            ? 'running'
            : autoCropAllApplied
              ? 'applied'
              : 'idle'
        }
        variant="toolbar"
        labels={{
          running: `Auto-cropping... ${autoCropProgress.done}/${autoCropProgress.total}`,
          applied: 'Auto-cropped all',
          idle: 'Auto-crop all',
        }}
        ariaLabels={{
          running: `Auto-cropping in progress, ${autoCropProgress.done} of ${autoCropProgress.total} done`,
          applied: 'Auto-crop applied to all images',
          idle: 'Auto-crop all images to detected content',
        }}
        title={autoCropAllApplied ? 'Auto-crop is applied' : undefined}
      />
    </div>
  </div>
)

type AutoCropButtonState = 'idle' | 'running' | 'applied'
type AutoCropButtonVariant = 'toolbar' | 'plain'

interface AutoCropButtonProps
{
  state: AutoCropButtonState
  variant: AutoCropButtonVariant
  labels: Record<AutoCropButtonState, string>
  minWidthClassName: string
  disabled: boolean
  onClick: () => void
  // aria-label varies by state so SRs say "Auto-crop applied" in done state
  // rather than the action description; pass the state-mapped strings here
  ariaLabels: Record<AutoCropButtonState, string>
  title?: string
}

const AutoCropButton = ({
  state,
  variant,
  labels,
  minWidthClassName,
  disabled,
  onClick,
  ariaLabels,
  title,
}: AutoCropButtonProps) =>
{
  const variantClass =
    variant === 'toolbar'
      ? 'border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] text-[var(--t-text-secondary)] enabled:hover:text-[var(--t-text)]'
      : state === 'applied'
        ? 'bg-[var(--t-bg-active)] text-[var(--t-text-muted)]'
        : 'text-[var(--t-text-muted)] enabled:hover:text-[var(--t-text)]'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`focus-custom inline-flex ${minWidthClassName} items-center justify-center gap-1 rounded px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] ${variantClass}`}
      aria-label={ariaLabels[state]}
      title={title}
    >
      {state === 'running' ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : state === 'applied' ? (
        <Check className="h-3 w-3" />
      ) : (
        <Crop className="h-3 w-3" />
      )}
      <span className={state === 'running' ? 'tabular-nums' : undefined}>
        {labels[state]}
      </span>
    </button>
  )
}

interface EmptyStateProps
{
  totalCount: number
  filter: ImageEditorFilter
}

const EmptyState = ({ totalCount, filter }: EmptyStateProps) =>
{
  const message =
    totalCount === 0
      ? 'This board has no image items to adjust yet.'
      : filter === 'mismatched'
        ? 'No items have aspect ratios that differ from the board.'
        : filter === 'adjusted'
          ? 'No items have manual adjustments yet.'
          : 'No items match this filter.'
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-[var(--t-text-muted)]">
      {message}
    </div>
  )
}

interface ImageEditorRailProps
{
  filter: ImageEditorFilter
  onFilterChange: (f: ImageEditorFilter) => void
  items: readonly TierItem[]
  totalCount: number
  boardAspectRatio: number
  boardDefaultFit: ImageFit | undefined
  boardLabels: BoardLabelSettings | undefined
  globalShowLabels: boolean
  selectedId: ItemId | null
  onSelect: (id: ItemId) => void
  // session-only marker for items the user hit Skip on; the rail surfaces
  // the deferred state w/ a small Pause icon so users can revisit explicitly
  isSkipped: (id: ItemId) => boolean
}

const ImageEditorRail = ({
  filter,
  onFilterChange,
  items,
  totalCount,
  boardAspectRatio,
  boardDefaultFit,
  boardLabels,
  globalShowLabels,
  selectedId,
  onSelect,
  isSkipped,
}: ImageEditorRailProps) => (
  <aside className="flex min-h-0 w-64 shrink-0 flex-col border-r border-[var(--t-border-secondary)] bg-[var(--t-bg-page)]">
    <div
      role="tablist"
      aria-label="Filter items"
      className="flex gap-1 border-b border-[var(--t-border-secondary)] p-2"
    >
      {FILTER_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={filter === opt.value}
          onClick={() => onFilterChange(opt.value)}
          className={`focus-custom flex-1 rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] ${
            filter === opt.value
              ? 'bg-[var(--t-accent)] text-[var(--t-accent-foreground)]'
              : 'text-[var(--t-text-muted)] hover:bg-[var(--t-bg-surface)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--t-border-secondary)] px-3 py-1.5 text-[0.65rem] text-[var(--t-text-faint)]">
      <span
        className="inline-flex items-center gap-1"
        title="Item ratio differs from the board — needs cropping or a new ratio"
      >
        <Crop aria-hidden="true" className="h-2.5 w-2.5 text-amber-300" />
        mismatched
      </span>
      <span
        className="inline-flex items-center gap-1"
        title="You've manually rotated, zoomed, panned, or auto-cropped this item"
      >
        <Check
          aria-hidden="true"
          className="h-2.5 w-2.5 text-[var(--t-accent)]"
        />
        adjusted
      </span>
      <span
        className="inline-flex items-center gap-1"
        title="Caption is hidden for this item — either inherited or per-tile override"
      >
        <EyeOff
          aria-hidden="true"
          className="h-2.5 w-2.5 text-[var(--t-text-faint)]"
        />
        label hidden
      </span>
      <span
        className="inline-flex items-center gap-1"
        title="You skipped this item — Smart Next won't loop back to it. Click the row to revisit."
      >
        <Pause
          aria-hidden="true"
          className="h-2.5 w-2.5 text-[var(--t-text-faint)]"
        />
        skipped
      </span>
    </div>
    <ul className="flex-1 overflow-y-auto">
      {items.length === 0 && (
        <li className="px-3 py-4 text-xs text-[var(--t-text-faint)]">
          {totalCount === 0 ? 'No image items.' : 'No items in this view.'}
        </li>
      )}
      {items.map((item) => (
        <ImageEditorRailRow
          key={item.id}
          item={item}
          boardAspectRatio={boardAspectRatio}
          boardDefaultFit={boardDefaultFit}
          boardLabels={boardLabels}
          globalShowLabels={globalShowLabels}
          selected={item.id === selectedId}
          skipped={isSkipped(item.id)}
          onSelect={() => onSelect(item.id)}
        />
      ))}
    </ul>
  </aside>
)

interface ImageEditorRailRowProps
{
  item: TierItem
  boardAspectRatio: number
  boardDefaultFit: ImageFit | undefined
  boardLabels: BoardLabelSettings | undefined
  globalShowLabels: boolean
  selected: boolean
  // user hit Skip on this item this session — rail draws a Pause indicator
  skipped: boolean
  onSelect: () => void
}

const ImageEditorRailRow = ({
  item,
  boardAspectRatio,
  boardDefaultFit,
  boardLabels,
  globalShowLabels,
  selected,
  skipped,
  onSelect,
}: ImageEditorRailRowProps) =>
{
  const mismatched = itemHasAspectMismatch(item, boardAspectRatio)
  const adjusted = !!item.transform && !isIdentityTransform(item.transform)
  const hasLabelOverride = !!item.labelOptions
  const labelLayout = resolveLabelLayout({
    itemOptions: item.labelOptions,
    boardSettings: boardLabels,
    globalShowLabels,
  })
  const labelHidden = !labelLayout.visible
  // mirror the main canvas: ItemContent applies any saved transform & resolves
  // the effective fit, so the thumb previews the same crop the board renders
  const effectiveFit = getEffectiveImageFit(item, boardDefaultFit)
  const thumbnailSize = boundedAspectSize(
    boardAspectRatio,
    RAIL_THUMBNAIL_BOUND
  )
  // each badge slot is rendered w/ reserved width so the right cluster
  // is the same total size on every row — prevents the row content from
  // shifting horizontally as the user navigates between items
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className={`flex w-full items-center gap-2 border-l-2 px-3 py-2 text-left text-xs transition-colors ${
          selected
            ? 'border-[var(--t-accent)] bg-[var(--t-bg-active)] text-[var(--t-text)]'
            : 'border-transparent text-[var(--t-text-secondary)] hover:bg-[var(--t-bg-surface)]'
        }`}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center">
          <div
            className="relative overflow-hidden rounded border border-[var(--t-border-secondary)] bg-[var(--t-bg-sunken)]"
            style={thumbnailSize}
          >
            <ItemContent
              item={item}
              fit={effectiveFit}
              frameAspectRatio={boardAspectRatio}
            />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">
            {item.label ?? 'Untitled'}
          </span>
          <span className="tabular-nums text-[var(--t-text-faint)]">
            {item.aspectRatio ? formatAspectRatio(item.aspectRatio) : '—'}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span
            className="inline-flex h-3 w-3 items-center justify-center"
            title={
              mismatched
                ? `Aspect ratio mismatch — item is ${
                    item.aspectRatio ? formatAspectRatio(item.aspectRatio) : '?'
                  } vs board ${formatAspectRatio(boardAspectRatio)}`
                : undefined
            }
            aria-label={mismatched ? 'Aspect ratio mismatch' : undefined}
            aria-hidden={mismatched ? undefined : 'true'}
          >
            {mismatched && (
              <Crop aria-hidden="true" className="h-3 w-3 text-amber-300" />
            )}
          </span>
          <span
            className="inline-flex h-3 w-3 items-center justify-center"
            title={
              adjusted
                ? 'Manually adjusted (rotate / zoom / pan)'
                : skipped
                  ? "Skipped — you deferred this item. Smart Next won't loop back here."
                  : undefined
            }
            aria-label={
              adjusted
                ? 'Manually adjusted'
                : skipped
                  ? 'Skipped (deferred)'
                  : undefined
            }
            aria-hidden={adjusted || skipped ? undefined : 'true'}
          >
            {adjusted ? (
              <Check
                aria-hidden="true"
                className="h-3 w-3 text-[var(--t-accent)]"
              />
            ) : skipped ? (
              <Pause
                aria-hidden="true"
                className="h-3 w-3 text-[var(--t-text-faint)]"
              />
            ) : null}
          </span>
          <span
            className="inline-flex h-3 w-3 items-center justify-center"
            title={
              labelHidden
                ? 'Caption is hidden for this item'
                : hasLabelOverride
                  ? 'Label has per-tile overrides'
                  : undefined
            }
            aria-label={
              labelHidden
                ? 'Label hidden'
                : hasLabelOverride
                  ? 'Label has per-tile overrides'
                  : undefined
            }
            aria-hidden={labelHidden || hasLabelOverride ? undefined : 'true'}
          >
            {labelHidden ? (
              <EyeOff
                aria-hidden="true"
                className="h-3 w-3 text-[var(--t-text-faint)]"
              />
            ) : hasLabelOverride ? (
              <span className="block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            ) : null}
          </span>
        </div>
      </button>
    </li>
  )
}

interface ImageEditorPaneProps
{
  item: TierItem
  boardAspectRatio: number
  // board-wide default fit; only consulted when the working transform is
  // identity, mirroring the actual tier-row render path
  boardDefaultFit: ImageFit | undefined
  trimSoftShadows: boolean
  boardLabels: BoardLabelSettings | undefined
  globalShowLabels: boolean
  // app-level fallback caption font when neither the item nor board overrides
  globalTextStyleId: TextStyleId
  // user's tile-size preference; preview scales label rendering to this so
  // strip-to-image proportions in the preview match the actual grid tile
  boardItemSize: ItemSize
  onCommit: (transform: ItemTransform | null) => void
  onLabelChange: (label: string) => void
  onLabelOptionsChange: (options: ItemLabelOptions | null) => void
  // broadcast this item's resolved label settings to the rest of the board.
  // disabled when the board has no other items
  onApplyLabelToAll: () => void
  canApplyLabelToAll: boolean
  // every item shares the board defaults — Apply-to-all is a no-op, mirror
  // the AutoCropButton's "applied" affordance so the user sees that state
  labelAppliedToAll: boolean
  applyLabelToAllTitle: string
  // collapsed/expanded state of the caption & image controls rows, lifted
  // to the modal so they survive item navigation. the Navigate row stays
  // visible regardless of `imageExpanded`
  captionExpanded: boolean
  onCaptionExpandedChange: (expanded: boolean) => void
  imageExpanded: boolean
  onImageExpandedChange: (expanded: boolean) => void
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
  // skip leaves the current item as-is & walks to the next one in raw
  // order; offered separately so "smart Next" & "leave this alone" stay
  // distinct in the affordance set
  onSkip: () => void
  canSkip: boolean
}

// editor state stays local until auto-save, blur, navigation, or bulk flush
const ImageEditorPane = forwardRef<ImageEditorPaneHandle, ImageEditorPaneProps>(
  function ImageEditorPane(
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
    // local draft used while the user is dragging the overlay caption — keeps
    // the displayed position responsive without spamming the undo log on every
    // pointer-move tick. drag end commits the final value via updateLabelOption
    const [placementDraft, setPlacementDraft] =
      useState<LabelOverlayPlacement | null>(null)
    const placementDraftRef = useRef(placementDraft)
    placementDraftRef.current = placementDraft

    // mirrors the image-pan snap state so caption drag can render the same
    // accent-line center guides while the user is at the snap point
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

    // navigating to a different tile resets any unsaved drag — a stale draft
    // would otherwise leak into the next item's preview
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

    // mid-drag draft wins so the preview tracks the cursor in real time;
    // commits flush to labelOptions on pointer up
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
    // tile-relative font scale — keeps strip/image proportions in the preview
    // matching what the grid actually renders. drag math reads the rendered
    // block's getBoundingClientRect so scaled bounds flow through automatically
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

    // in-pane controls update local working state; auto-save settles the draft
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

    // committed reflects what's currently saved to the store (or baseline if
    // none); working becomes "dirty" when it diverges from this
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
        nextOrUpdate:
          | ItemTransform
          | ((current: ItemTransform) => ItemTransform)
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

    // unmount = pane navigation or modal close; auto-flush so users don't lose
    // a pending edit by hitting Done or scrolling to a different item
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
        createFitBaselineTransform(
          item,
          frameAspectRatio,
          effectiveFit,
          rotation
        ).zoom,
      [item, frameAspectRatio, effectiveFit]
    )

    // drag-to-pan — visualW/H are the image's screen extent in frame-units,
    // captured at pointer-down so edge-snap targets don't drift mid-drag
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
      (e: React.PointerEvent<HTMLDivElement>) =>
      {
        if (e.button !== 0 || !url) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        setIsDragging(true)
        // un-rotated CSS extent (frame-units), then map through rotation:
        // 90/270 swaps the axes & rescales by frameRatio because frame W & H
        // are different in pixels
        const cropSize = resolveManualCropImageSize(
          item.aspectRatio,
          frameAspectRatio,
          working.rotation
        )
        const wp = (cropSize.widthPercent / 100) * working.zoom
        const hp = (cropSize.heightPercent / 100) * working.zoom
        const isQuarterTurn =
          working.rotation === 90 || working.rotation === 270
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
      (e: React.PointerEvent<HTMLDivElement>) =>
      {
        const drag = dragRef.current
        if (!drag) return
        const deltaX = e.clientX - drag.startX
        const deltaY = e.clientY - drag.startY
        if (
          !drag.moved &&
          Math.hypot(deltaX, deltaY) < PAN_START_THRESHOLD_PX
        )
        {
          return
        }
        drag.moved = true
        let nextOffsetX = drag.baseOffX + deltaX / canvasW
        let nextOffsetY = drag.baseOffY + deltaY / canvasH
        // Alt held bypasses snapping for fine alignment near the center
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

    const onPointerEnd = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) =>
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
      },
      []
    )

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
      setWorkingDraft((w) =>
        clampItemTransform({ ...w, offsetX: 0, offsetY: 0 })
      )
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
          resolveAutoCropTransform(
            item,
            bbox,
            frameAspectRatio,
            working.rotation
          )
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

    // arrow keys nudge by 1 canvas-px (Shift = 10px); interactive controls
    // keep their own keyboard behavior
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

    // wheel-to-zoom anchored on the cursor; React's synthetic onWheel is
    // passive so we attach a manual non-passive listener to preventDefault
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
      : '—'

    const mismatched = itemHasAspectMismatch(item, boardAspectRatio)
    const boardRatioLabel = formatAspectRatio(boardAspectRatio)
    // amber tint draws the eye to mismatched items so users know exactly what
    // the editor's reframing is reconciling
    const ratioBadgeClass = mismatched
      ? 'border-amber-300/50 bg-amber-300/10 text-amber-200'
      : 'border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] text-[var(--t-text-muted)]'
    // hover/active styling for the actionable variant — stronger border &
    // subtle bg shift so the click affordance is obvious. plain chip stays
    // borderless-on-hover so it doesn't tease an action it can't perform
    const ratioBadgeActionableClass = mismatched
      ? 'cursor-pointer hover:border-amber-200 hover:bg-amber-300/20 active:bg-amber-300/30'
      : 'cursor-pointer hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-active)]'
    // chip becomes a one-click auto-crop affordance when there's a mismatch
    // & detection is available — clicking matches the user's likely intent
    const ratioChipActionable =
      mismatched &&
      !!autoCropHash &&
      autoCropResult !== null &&
      !autoCropApplied
    const ratioChipTitle = mismatched
      ? ratioChipActionable
        ? `Item is ${ratioLabel} — board is ${boardRatioLabel}. Click to auto-crop to fit.`
        : `Item is ${ratioLabel} — board is ${boardRatioLabel}. Crop or pick a new ratio.`
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
              <span aria-hidden="true">→</span>
              <span>{boardRatioLabel}</span>
            </button>
          ) : (
            <span
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 tabular-nums ${ratioBadgeClass}`}
              title={ratioChipTitle}
            >
              <span>{ratioLabel}</span>
              <span aria-hidden="true">→</span>
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
            {captionPreviewMode &&
              resolvedPlacement.mode === 'captionAbove' && (
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
            {captionPreviewMode &&
              resolvedPlacement.mode === 'captionBelow' && (
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
            // setting an explicit pixel value supersedes the legacy preset
            // for this item — clear sizeScale so resolution stays predictable
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
              imageExpanded
                ? 'Collapse image controls'
                : 'Expand image controls'
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
                  title="Rotate 90° counter-clockwise"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => rotate(90)}
                  className="focus-custom rounded p-1.5 text-[var(--t-text-muted)] hover:bg-[var(--t-bg-surface)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
                  aria-label="Rotate right 90 degrees"
                  title="Rotate 90° clockwise"
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
                title="Center the image — clears the pan offset"
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
                  autoCropping
                    ? 'running'
                    : autoCropApplied
                      ? 'applied'
                      : 'idle'
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
                    ? 'Already auto-cropped — adjust or reset to re-run'
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
  }
)

interface DraggableLabelOverlayProps
{
  // resolved label settings (placement, scrim, sizing, text style, text) —
  // identical to the shape used by ItemContent so the rendered visual is
  // pixel-equivalent between the editor preview & the live grid
  display: ResolvedLabelDisplay
  canvasRef: RefObject<HTMLDivElement | null>
  // x,y are clamped block-center positions; snap reports which axis is at
  // the canvas center so the parent can render alignment guides
  onDragMove: (x: number, y: number, snap: { x: boolean; y: boolean }) => void
  onDragEnd: () => void
}

const LABEL_SNAP_THRESHOLD_PX = 5

// pointer-events on so the user can drag the caption; otherwise renders the
// shared OverlayLabelBlock so the visual matches grid tiles bit-for-bit
const DraggableLabelOverlay = ({
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
    (e: React.PointerEvent<HTMLDivElement>) =>
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
      // half-block size as a fraction of canvas; capped at 0.5 so a caption
      // wider than the canvas locks to center rather than going negative
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
    (e: React.PointerEvent<HTMLDivElement>) =>
    {
      const drag = dragRef.current
      if (!drag) return
      e.stopPropagation()
      const dx = (e.clientX - drag.startX) / drag.canvasW
      const dy = (e.clientY - drag.startY) / drag.canvasH
      // clamp the block-center so the FULL block stays inside the canvas;
      // matches the production overflow-hidden frame's expectations
      let nextX = clamp(drag.baseX + dx, drag.halfW, 1 - drag.halfW)
      let nextY = clamp(drag.baseY + dy, drag.halfH, 1 - drag.halfH)
      let snapX = false
      let snapY = false
      // alt bypass mirrors the image-pan snap; threshold uses canvas px so
      // it feels the same regardless of board ratio
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
    (e: React.PointerEvent<HTMLDivElement>) =>
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
      // safari needs explicit z-index so the overlay stays above the image
      // during drag; without it the block can vanish behind transforms.
      // touchAction:none keeps the browser from intercepting drag gestures
      extraStyle={{
        zIndex: 1,
        touchAction: 'none',
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
    />
  )
}

interface LabelEditorRowProps
{
  resolvedPlacement: LabelPlacement
  resolvedScrim: LabelScrim
  resolvedTextColor: LabelTextColor
  // resolved caption size in px — drives the numeric input + preview
  resolvedFontSizePx: number
  resolvedTextStyleId: TextStyleId | undefined
  // value the Font select falls through to when 'Use board font' is picked —
  // surfaced inline so users see what "inherit" actually resolves to
  inheritedTextStyleLabel: string
  // true when board (or app-level) setting hides labels — drives the per-tile
  // chip's "default" rendering when the user has no per-item override
  boardDefaultVisible: boolean
  itemOptions: ItemLabelOptions | undefined
  onPlacementChange: (placement: LabelPlacement) => void
  onScrimChange: (s: LabelScrim) => void
  onTextColorChange: (c: LabelTextColor) => void
  onFontSizePxChange: (px: number | undefined) => void
  onTextStyleChange: (t: TextStyleId | undefined) => void
  onVisibleChange: (visible: boolean) => void
  onClearOverrides: () => void
  // push current effective label settings to the rest of the board — disabled
  // when there's nothing to broadcast (no items besides this one)
  onApplyToAll: () => void
  canApplyToAll: boolean
  // every item already inherits the board defaults — re-applying is a no-op,
  // so disable the action & swap the affordance to a "done" tint
  appliedToAll: boolean
  applyToAllTitle: string
  // collapsed-by-default caption section — first control acts as the toggle
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
}

const LABEL_FONT_LABELS: Record<TextStyleId, string> = {
  default: 'Sans',
  mono: 'Mono',
  serif: 'Serif',
  rounded: 'Rounded',
  display: 'Display',
}

const INHERIT_TEXT_STYLE_VALUE = '__inherit'

const LABEL_TEXT_COLOR_NAMES: Record<LabelTextColor, string> = {
  auto: 'Auto',
  white: 'White',
  black: 'Black',
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  purple: 'Purple',
}

const PLACEMENT_MODE_LABELS: Record<LabelPlacementMode, string> = {
  overlay: 'Overlay',
  captionAbove: 'Caption above',
  captionBelow: 'Caption below',
}

const PLACEMENT_MODE_ORDER: readonly LabelPlacementMode[] = [
  'overlay',
  'captionAbove',
  'captionBelow',
]

const PLACEMENT_PRESET_ORDER: readonly (keyof typeof LABEL_PLACEMENT_OVERLAY_PRESETS)[] =
  ['top', 'middle', 'bottom']

const PLACEMENT_PRESET_LABELS: Record<
  keyof typeof LABEL_PLACEMENT_OVERLAY_PRESETS,
  string
> = {
  top: 'Top',
  middle: 'Middle',
  bottom: 'Bottom',
}

// detect whether the resolved overlay placement matches a preset so the
// preset chip can highlight the active snap target instead of looking dead
const isOverlayPresetMatch = (
  placement: LabelPlacement,
  preset: LabelOverlayPlacement
): boolean =>
  placement.mode === 'overlay' &&
  Math.abs(placement.x - preset.x) < 0.001 &&
  Math.abs(placement.y - preset.y) < 0.001

const LabelEditorRow = ({
  resolvedPlacement,
  resolvedScrim,
  resolvedTextColor,
  resolvedFontSizePx,
  resolvedTextStyleId,
  inheritedTextStyleLabel,
  boardDefaultVisible,
  itemOptions,
  onPlacementChange,
  onScrimChange,
  onTextColorChange,
  onFontSizePxChange,
  onTextStyleChange,
  onVisibleChange,
  onClearOverrides,
  onApplyToAll,
  canApplyToAll,
  appliedToAll,
  applyToAllTitle,
  expanded,
  onExpandedChange,
}: LabelEditorRowProps) =>
{
  const sizeId = useId()
  const fontId = useId()
  const sectionId = useId()
  const isOverlay = resolvedPlacement.mode === 'overlay'
  const hasOverrides = itemOptions !== undefined
  const applyDisabled = !canApplyToAll || appliedToAll
  const appliedTitle = appliedToAll
    ? 'Every item already matches the board defaults — nothing left to apply'
    : applyToAllTitle

  // mode change carries a sensible default placement — going back to overlay
  // resets to the bottom anchor so the user has a deterministic landing spot
  const handleModeSelect = (mode: LabelPlacementMode) =>
  {
    if (mode === resolvedPlacement.mode) return
    if (mode === 'overlay')
    {
      onPlacementChange(
        resolvedPlacement.mode === 'overlay'
          ? resolvedPlacement
          : LABEL_PLACEMENT_DEFAULT
      )
      return
    }
    onPlacementChange({ mode })
  }

  return (
    <div
      className="flex flex-col gap-2 border-t border-[var(--t-border-secondary)] bg-[var(--t-bg-page)] px-5 py-2 text-xs"
      role="group"
      aria-label="Caption"
    >
      <button
        type="button"
        onClick={() => onExpandedChange(!expanded)}
        aria-expanded={expanded}
        aria-controls={sectionId}
        className="focus-custom inline-flex w-fit items-center gap-1 rounded px-1 py-0.5 text-[0.65rem] font-semibold tracking-wider text-[var(--t-text-faint)] uppercase hover:text-[var(--t-text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
        title={
          expanded ? 'Collapse caption controls' : 'Expand caption controls'
        }
      >
        <ChevronRight
          className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        Caption
      </button>
      {expanded && (
        <div id={sectionId} className="flex flex-wrap items-center gap-3">
          <div
            className="flex items-center gap-1 rounded border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] p-0.5"
            role="group"
            aria-label="Caption visibility for this item"
            title={
              itemOptions?.visible === undefined
                ? `No override — falls back to the board default (currently ${
                    boardDefaultVisible ? 'shown' : 'hidden'
                  }). Pick Show or Hide here to override.`
                : `Per-item override active — this item is ${
                    itemOptions.visible ? 'always shown' : 'always hidden'
                  } regardless of the board default`
            }
          >
            <SegmentedChip
              active={itemOptions?.visible === true}
              onClick={() => onVisibleChange(true)}
              label="Show"
            />
            <SegmentedChip
              active={itemOptions?.visible === false}
              onClick={() => onVisibleChange(false)}
              label="Hide"
            />
          </div>
          <div
            className="flex items-center gap-1 rounded border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] p-0.5"
            role="group"
            aria-label="Placement"
          >
            {PLACEMENT_MODE_ORDER.map((mode) => (
              <SegmentedChip
                key={mode}
                active={resolvedPlacement.mode === mode}
                onClick={() => handleModeSelect(mode)}
                label={PLACEMENT_MODE_LABELS[mode]}
              />
            ))}
          </div>
          {/* Position + Backdrop only apply to overlay mode. Rendered visibly
              dimmed (rather than hidden) when not in overlay so users can
              see the controls exist & understand which mode they belong to */}
          <div
            className={`flex items-center gap-1 rounded border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] p-0.5 transition-opacity ${
              isOverlay ? '' : 'pointer-events-none opacity-40'
            }`}
            role="group"
            aria-label="Caption position"
            title={
              isOverlay
                ? 'Anchor the overlay caption to the top, middle, or bottom of the image'
                : 'Caption position only applies in Overlay mode — switch placement to Overlay to use these'
            }
            aria-disabled={!isOverlay}
          >
            {PLACEMENT_PRESET_ORDER.map((presetKey) =>
            {
              const preset = LABEL_PLACEMENT_OVERLAY_PRESETS[presetKey]
              return (
                <SegmentedChip
                  key={presetKey}
                  active={
                    isOverlay && isOverlayPresetMatch(resolvedPlacement, preset)
                  }
                  onClick={() => onPlacementChange(preset)}
                  label={PLACEMENT_PRESET_LABELS[presetKey]}
                  disabled={!isOverlay}
                />
              )
            })}
          </div>
          <div
            className={`flex items-center gap-2 transition-opacity ${
              isOverlay ? '' : 'pointer-events-none opacity-40'
            }`}
            aria-disabled={!isOverlay}
          >
            <label
              className="text-[var(--t-text-muted)]"
              title={
                isOverlay
                  ? 'Caption backdrop — sits behind the text for legibility'
                  : 'Backdrop only applies in Overlay mode'
              }
            >
              Backdrop
            </label>
            <select
              value={resolvedScrim}
              onChange={(e) => onScrimChange(e.target.value as LabelScrim)}
              disabled={!isOverlay}
              className="focus-custom rounded border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-1 py-1 text-[var(--t-text)] focus-visible:border-[var(--t-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] disabled:cursor-not-allowed"
              aria-label="Caption backdrop"
              title={
                isOverlay
                  ? 'Caption backdrop — sits behind the text for legibility'
                  : 'Backdrop only applies in Overlay mode'
              }
              tabIndex={isOverlay ? undefined : -1}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="none">None</option>
            </select>
          </div>
          <div
            className={`flex items-center gap-2 transition-opacity ${
              isOverlay ? '' : 'pointer-events-none opacity-40'
            }`}
            aria-disabled={!isOverlay}
          >
            <label
              className="text-[var(--t-text-muted)]"
              title={
                isOverlay
                  ? 'Overlay text color — auto picks white or black based on the backdrop'
                  : 'Color only applies in Overlay mode'
              }
            >
              Color
            </label>
            <select
              value={resolvedTextColor}
              onChange={(e) =>
                onTextColorChange(e.target.value as LabelTextColor)
              }
              disabled={!isOverlay}
              className="focus-custom rounded border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-1 py-1 text-[var(--t-text)] focus-visible:border-[var(--t-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] disabled:cursor-not-allowed"
              aria-label="Overlay text color"
              tabIndex={isOverlay ? undefined : -1}
            >
              {LABEL_TEXT_COLORS.map((c) => (
                <option key={c} value={c}>
                  {LABEL_TEXT_COLOR_NAMES[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor={fontId} className="text-[var(--t-text-muted)]">
              Font
            </label>
            <select
              id={fontId}
              value={resolvedTextStyleId ?? INHERIT_TEXT_STYLE_VALUE}
              onChange={(e) =>
              {
                const v = e.target.value
                onTextStyleChange(
                  v === INHERIT_TEXT_STYLE_VALUE
                    ? undefined
                    : (v as TextStyleId)
                )
              }}
              className="focus-custom rounded border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-1 py-1 text-[var(--t-text)] focus-visible:border-[var(--t-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
              title={`Use the board font (currently ${inheritedTextStyleLabel}) or override per item`}
            >
              <option value={INHERIT_TEXT_STYLE_VALUE}>
                Use board font ({inheritedTextStyleLabel})
              </option>
              {TEXT_STYLE_IDS.map((id) => (
                <option key={id} value={id}>
                  {LABEL_FONT_LABELS[id]}
                </option>
              ))}
            </select>
          </div>
          <FontSizeInput
            id={sizeId}
            value={resolvedFontSizePx}
            onChange={onFontSizePxChange}
            active={
              itemOptions?.fontSizePx !== undefined ||
              itemOptions?.sizeScale !== undefined
            }
          />
          <button
            type="button"
            onClick={onClearOverrides}
            disabled={!hasOverrides}
            className="focus-custom inline-flex items-center gap-1 rounded px-2 py-1 text-[var(--t-text-muted)] enabled:hover:text-[var(--t-text)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
            title="Clear this item's caption overrides"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onApplyToAll}
            disabled={applyDisabled}
            aria-label={
              appliedToAll
                ? 'Caption settings already applied to all items'
                : 'Apply caption settings to all items'
            }
            className={`focus-custom ml-auto inline-flex items-center gap-1 rounded px-2 py-1 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] ${
              appliedToAll
                ? 'bg-[var(--t-bg-active)] text-[var(--t-text-muted)] disabled:opacity-100'
                : 'text-[var(--t-text-muted)] enabled:hover:text-[var(--t-text)] disabled:opacity-40'
            }`}
            title={appliedTitle}
          >
            {appliedToAll ? (
              <Check className="h-3 w-3" />
            ) : (
              <Wand2 className="h-3 w-3" />
            )}
            {appliedToAll ? 'Applied to all items' : 'Apply to all items'}
          </button>
        </div>
      )}
    </div>
  )
}

interface SaveStatusIndicatorProps
{
  dirty: boolean
  savedFlash: boolean
}

// passive save indicator — communicates the auto-save model w/o asking the
// user to take action. dirty = mid-edit; flash = a commit just settled
const SaveStatusIndicator = ({
  dirty,
  savedFlash,
}: SaveStatusIndicatorProps) =>
{
  if (dirty)
  {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 text-[0.65rem] text-[var(--t-text-faint)]"
        role="status"
        aria-live="polite"
        title="Edits are saved automatically a moment after you stop changing things"
      >
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-[var(--t-accent)] motion-safe:animate-pulse"
        />
        Editing…
      </span>
    )
  }
  if (savedFlash)
  {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 text-[0.65rem] text-[var(--t-text-faint)]"
        role="status"
        aria-live="polite"
      >
        <Check aria-hidden="true" className="h-2.5 w-2.5 text-emerald-400" />
        Saved
      </span>
    )
  }
  return null
}

interface FontSizeInputProps
{
  id: string
  value: number
  onChange: (px: number | undefined) => void
  // styles the input as 'override active' so users can see at a glance
  // whether their tile is following the board default or has a per-tile size
  active: boolean
}

const FONT_SIZE_STEP_PX = 1

interface NumberStepperProps
{
  id?: string
  value: number
  min: number
  max: number
  step: number
  suffix: string
  inputLabel: string
  decreaseLabel: string
  increaseLabel: string
  decreaseTitle: string
  increaseTitle: string
  active?: boolean
  parseValue?: (value: string) => number | null
  onChange: (value: number) => void
}

const NumberStepper = ({
  id,
  value,
  min,
  max,
  step,
  suffix,
  inputLabel,
  decreaseLabel,
  increaseLabel,
  decreaseTitle,
  increaseTitle,
  active = false,
  parseValue,
  onChange,
}: NumberStepperProps) =>
{
  const [draft, setDraft] = useState<string | null>(null)
  const visible = draft ?? String(value)

  const commitDraft = useCallback(() =>
  {
    if (draft === null) return
    const parsed = parseValue ? parseValue(draft) : Number(draft)
    if (parsed === null || !Number.isFinite(parsed))
    {
      setDraft(null)
      return
    }
    const next = clamp(Math.round(parsed), min, max)
    setDraft(null)
    if (next !== value) onChange(next)
  }, [draft, max, min, parseValue, value, onChange])

  const nudge = useCallback(
    (delta: number) =>
    {
      const next = clamp(value + delta, min, max)
      setDraft(null)
      if (next !== value) onChange(next)
    },
    [max, min, value, onChange]
  )

  return (
    <div
      className={`inline-flex items-stretch overflow-hidden rounded border bg-[var(--t-bg-surface)] focus-within:border-[var(--t-border-hover)] focus-within:ring-2 focus-within:ring-[var(--t-accent)] ${
        active
          ? 'border-[var(--t-border-hover)]'
          : 'border-[var(--t-border-secondary)]'
      }`}
    >
      <button
        type="button"
        onClick={() => nudge(-step)}
        disabled={value <= min}
        aria-label={decreaseLabel}
        title={decreaseTitle}
        className="focus-custom flex w-6 items-center justify-center text-[var(--t-text-muted)] enabled:hover:text-[var(--t-text)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
      >
        −
      </button>
      <label className="flex h-7 items-center px-1 text-[var(--t-text-muted)]">
        <input
          id={id}
          type="text"
          value={visible}
          inputMode="numeric"
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) =>
          {
            setDraft(String(value))
            e.currentTarget.select()
          }}
          onBlur={commitDraft}
          onKeyDown={(e) =>
          {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape')
            {
              setDraft(null)
              e.currentTarget.blur()
            }
          }}
          className="w-9 bg-transparent text-right tabular-nums text-[var(--t-text)] outline-none [appearance:textfield]"
          aria-label={inputLabel}
          spellCheck={false}
        />
        <span aria-hidden="true" className="pl-0.5 text-[0.65rem]">
          {suffix}
        </span>
      </label>
      <button
        type="button"
        onClick={() => nudge(step)}
        disabled={value >= max}
        aria-label={increaseLabel}
        title={increaseTitle}
        className="focus-custom flex w-6 items-center justify-center text-[var(--t-text-muted)] enabled:hover:text-[var(--t-text)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
      >
        +
      </button>
    </div>
  )
}

const FontSizeInput = ({ id, value, onChange, active }: FontSizeInputProps) =>
{
  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor={id}
        className="text-[var(--t-text-muted)]"
        title={`Caption font size (${LABEL_FONT_SIZE_PX_MIN}–${LABEL_FONT_SIZE_PX_MAX}px)`}
      >
        Size
      </label>
      <NumberStepper
        id={id}
        value={value}
        min={LABEL_FONT_SIZE_PX_MIN}
        max={LABEL_FONT_SIZE_PX_MAX}
        step={FONT_SIZE_STEP_PX}
        suffix="px"
        inputLabel="Caption font size in pixels"
        decreaseLabel="Decrease font size"
        increaseLabel="Increase font size"
        decreaseTitle="Smaller"
        increaseTitle="Larger"
        active={active}
        onChange={onChange}
      />
    </div>
  )
}

interface SegmentedChipProps
{
  active: boolean
  onClick: () => void
  label: string
  // optional — when true, suppresses interaction & uses muted styling so the
  // chip reads as inapplicable (Caption position outside Overlay mode, etc.)
  disabled?: boolean
}

// shared two/three-state chip used for placement, snap presets, & the
// visibility toggle. one component keeps spacing & hover states consistent
const SegmentedChip = ({
  active,
  onClick,
  label,
  disabled,
}: SegmentedChipProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-pressed={active}
    className={`focus-custom rounded px-2 py-0.5 text-[11px] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] disabled:cursor-not-allowed ${
      active
        ? 'bg-[var(--t-accent)] text-[var(--t-accent-foreground)]'
        : 'text-[var(--t-text-muted)] enabled:hover:text-[var(--t-text)]'
    }`}
  >
    {label}
  </button>
)

interface ZoomSliderProps
{
  value: number
  min: number
  sliderMax: number
  onLiveChange: (value: number) => void
}

// HTML range input fires on every value tick; auto-save settles the draft
const ZoomSlider = ({
  value,
  min,
  sliderMax,
  onLiveChange,
}: ZoomSliderProps) =>
{
  const percentValue = Math.round(clamp(value, min, sliderMax) * 100)
  const percentMin = Math.ceil(min * 100)
  const percentMax = Math.floor(sliderMax * 100)
  const sliderMin = ceilToStep(min, ZOOM_SLIDER_STEP)
  const sliderMaxValue = Math.max(
    sliderMin,
    floorToStep(sliderMax, ZOOM_SLIDER_STEP)
  )
  const sliderValue = clamp(
    roundToStep(value, ZOOM_SLIDER_STEP),
    sliderMin,
    sliderMaxValue
  )

  return (
    <div className="flex items-center gap-2 text-xs text-[var(--t-text-muted)]">
      <span>Zoom</span>
      <input
        type="range"
        min={sliderMin}
        max={sliderMaxValue}
        step={ZOOM_SLIDER_STEP}
        value={sliderValue}
        onChange={(e) =>
          onLiveChange(
            clamp(
              roundToStep(Number(e.target.value), ZOOM_SLIDER_STEP),
              sliderMin,
              sliderMaxValue
            )
          )
        }
        className="w-56 accent-[var(--t-accent)] max-sm:w-36"
        aria-label="Zoom"
      />
      <NumberStepper
        value={percentValue}
        min={percentMin}
        max={percentMax}
        step={1}
        suffix="%"
        inputLabel="Zoom percent"
        decreaseLabel="Zoom out by 1 percent"
        increaseLabel="Zoom in by 1 percent"
        decreaseTitle="Decrease zoom by 1%"
        increaseTitle="Increase zoom by 1%"
        parseValue={parsePercentInput}
        onChange={(nextPercent) => onLiveChange(nextPercent / 100)}
      />
    </div>
  )
}
