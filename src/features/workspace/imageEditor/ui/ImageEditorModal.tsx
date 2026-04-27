// src/features/workspace/imageEditor/ui/ImageEditorModal.tsx
// master-detail editor for per-item rotation, zoom, & pan transforms; crop
// frame locks to the board aspect ratio so the preview matches the tier rows

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
} from 'react'
import {
  Check,
  Crop,
  Crosshair,
  Loader2,
  RefreshCw,
  RotateCcw,
  RotateCw,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
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
  formatAspectRatio,
  getBoardItemAspectRatio,
  getEffectiveImageFit,
  itemHasAspectMismatch,
} from '~/features/workspace/boards/lib/aspectRatio'
import { OBJECT_FIT_CLASS } from '~/shared/board-ui/constants'
import { ItemContent } from '~/shared/board-ui/ItemContent'
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
import { BaseModal } from '~/shared/overlay/BaseModal'
import { ConfirmDialog } from '~/shared/overlay/ConfirmDialog'
import { ModalHeader } from '~/shared/overlay/ModalHeader'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
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
// snap-to-center bypassed when Alt is held; threshold is per axis
const PAN_SNAP_THRESHOLD_PX = 5
const WHEEL_ZOOM_SENSITIVITY = 0.0015

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

const transformKey = (transform: ItemTransform | undefined): string =>
  transform
    ? `${transform.rotation}:${transform.zoom}:${transform.offsetX}:${transform.offsetY}`
    : 'identity'

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
  } = useActiveBoardStore(
    useShallow((s) => ({
      items: s.items,
      tiers: s.tiers,
      unrankedItemIds: s.unrankedItemIds,
      boardAspectRatio: getBoardItemAspectRatio(s),
      setItemTransform: s.setItemTransform,
      setItemsTransform: s.setItemsTransform,
      boardDefaultFit: s.defaultItemImageFit,
    }))
  )
  const ratioPicker = useBoardAspectRatioPicker()
  const { trimSoftShadows, setTrimSoftShadows } = useAutoCropTrimShadows()
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

  const goNext = useCallback(() =>
  {
    if (selectedIndex < 0 || selectedIndex >= filteredItems.length - 1) return
    setPickedId(filteredItems[selectedIndex + 1].id)
  }, [selectedIndex, filteredItems])

  const handleCommit = useCallback(
    (id: ItemId, transform: ItemTransform | null) =>
      setItemTransform(id, transform),
    [setItemTransform]
  )

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
        <ModalHeader titleId={titleId}>Edit images</ModalHeader>
        <SecondaryButton onClick={close} variant="surface" size="sm">
          Done
        </SecondaryButton>
      </div>
      <BoardControlsBar
        ratioPicker={ratioPicker}
        onAutoCropAll={requestAutoCropAll}
        autoCropProgress={autoCropProgress}
        autoCropAllApplied={autoCropAllApplied}
        trimSoftShadows={trimSoftShadows}
        onTrimSoftShadowsChange={setTrimSoftShadows}
      />
      <div className="flex min-h-0 flex-1">
        <ImageEditorRail
          filter={filter}
          onFilterChange={setFilter}
          items={filteredItems}
          totalCount={allImageItems.length}
          boardAspectRatio={boardAspectRatio}
          boardDefaultFit={boardDefaultFit}
          selectedId={selectedId}
          onSelect={setPickedId}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          {selectedItem ? (
            <ImageEditorPane
              ref={activePaneRef}
              key={`${selectedItem.id}:${transformKey(selectedItem.transform)}:${boardAspectRatio}:${getEffectiveImageFit(selectedItem, boardDefaultFit)}`}
              item={selectedItem}
              boardAspectRatio={boardAspectRatio}
              boardDefaultFit={boardDefaultFit}
              trimSoftShadows={trimSoftShadows}
              onCommit={(t) => handleCommit(selectedItem.id, t)}
              canPrev={selectedIndex > 0}
              canNext={
                selectedIndex >= 0 && selectedIndex < filteredItems.length - 1
              }
              onPrev={goPrev}
              onNext={goNext}
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
    </BaseModal>
  )
}

interface BoardControlsBarProps
{
  ratioPicker: ReturnType<typeof useBoardAspectRatioPicker>
  onAutoCropAll: () => void
  autoCropProgress: { running: boolean; done: number; total: number }
  autoCropAllApplied: boolean
  trimSoftShadows: boolean
  onTrimSoftShadowsChange: (trim: boolean) => void
}

// board-wide controls — board ratio chips plus crop actions for the editor
const BoardControlsBar = ({
  ratioPicker,
  onAutoCropAll,
  autoCropProgress,
  autoCropAllApplied,
  trimSoftShadows,
  onTrimSoftShadowsChange,
}: BoardControlsBarProps) => (
  <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--t-border-secondary)] bg-[var(--t-bg-page)] px-5 py-2">
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-[var(--t-text-muted)]">
        Board ratio
      </span>
      <AspectRatioChips
        selectedOption={ratioPicker.selectedOption}
        onSelect={ratioPicker.handleOption}
        autoRatio={ratioPicker.autoRatio}
      />
      {ratioPicker.customOpen && (
        <CustomRatioInput
          width={ratioPicker.customWidth}
          height={ratioPicker.customHeight}
          onWidthChange={ratioPicker.setCustomWidth}
          onHeightChange={ratioPicker.setCustomHeight}
          onApply={ratioPicker.applyCustom}
          canApply={ratioPicker.canApplyCustom}
        />
      )}
    </div>
    <div className="flex flex-wrap items-center justify-end gap-2">
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
        aria-label="Auto-crop all images to detected content"
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
  'aria-label': string
  title?: string
}

const AutoCropButton = ({
  state,
  variant,
  labels,
  minWidthClassName,
  disabled,
  onClick,
  'aria-label': ariaLabel,
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
      aria-label={ariaLabel}
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
  selectedId: ItemId | null
  onSelect: (id: ItemId) => void
}

const ImageEditorRail = ({
  filter,
  onFilterChange,
  items,
  totalCount,
  boardAspectRatio,
  boardDefaultFit,
  selectedId,
  onSelect,
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
    <div className="flex items-center gap-3 border-b border-[var(--t-border-secondary)] px-3 py-1.5 text-[0.65rem] text-[var(--t-text-faint)]">
      <span className="inline-flex items-center gap-1">
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-amber-400"
        />
        mismatched
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-[var(--t-accent)]"
        />
        adjusted
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
          selected={item.id === selectedId}
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
  selected: boolean
  onSelect: () => void
}

const ImageEditorRailRow = ({
  item,
  boardAspectRatio,
  boardDefaultFit,
  selected,
  onSelect,
}: ImageEditorRailRowProps) =>
{
  const mismatched = itemHasAspectMismatch(item, boardAspectRatio)
  const adjusted = !!item.transform && !isIdentityTransform(item.transform)
  // mirror the main canvas: ItemContent applies any saved transform & resolves
  // the effective fit, so the thumb previews the same crop the board renders
  const effectiveFit = getEffectiveImageFit(item, boardDefaultFit)
  const thumbnailSize = boundedAspectSize(
    boardAspectRatio,
    RAIL_THUMBNAIL_BOUND
  )
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
          selected
            ? 'bg-[var(--t-bg-surface)] text-[var(--t-text)]'
            : 'text-[var(--t-text-secondary)] hover:bg-[var(--t-bg-surface)]'
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
          <span className="text-[var(--t-text-faint)]">
            {item.aspectRatio ? formatAspectRatio(item.aspectRatio) : '—'}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1">
          {mismatched && (
            <span
              title="Aspect ratio mismatch"
              aria-label="Aspect ratio mismatch"
              className="h-1.5 w-1.5 rounded-full bg-amber-400"
            />
          )}
          {adjusted && (
            <span
              title="Manually adjusted"
              aria-label="Manually adjusted"
              className="h-1.5 w-1.5 rounded-full bg-[var(--t-accent)]"
            />
          )}
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
  onCommit: (transform: ItemTransform | null) => void
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
}

// editor state stays local until Confirm, pane navigation, modal close, or
// parent bulk actions flush pending work
const ImageEditorPane = forwardRef<ImageEditorPaneHandle, ImageEditorPaneProps>(
  function ImageEditorPane(
    {
      item,
      boardAspectRatio,
      boardDefaultFit,
      trimSoftShadows,
      onCommit,
      canPrev,
      canNext,
      onPrev,
      onNext,
    }: ImageEditorPaneProps,
    ref
  )
  {
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
    const fitBaseline = useMemo(
      () => createFitBaselineTransform(item, boardAspectRatio, effectiveFit),
      [item, boardAspectRatio, effectiveFit]
    )
    const savedTransform = getSavedTransform(item)
    const hasSavedTransform = !!savedTransform
    const [working, setWorking] = useState<ItemTransform>(() =>
      seedTransform(item, boardAspectRatio, effectiveFit)
    )
    const [isDragging, setIsDragging] = useState(false)
    const [snap, setSnap] = useState<{ x: boolean; y: boolean }>({
      x: false,
      y: false,
    })
    const [autoCropping, setAutoCropping] = useState(false)
    const canvasRef = useRef<HTMLDivElement | null>(null)
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

    // commit-only flow — in-pane controls update local working state; saved
    // transform changes on Confirm, unmount flush, or parent bulk flush
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

    // refs keep the unmount-flush effect free of stale closures — we only
    // re-run it on actual unmount, but it must see the latest working state
    const workingRef = useRef(working)
    workingRef.current = working
    const isDirtyRef = useRef(isDirty)
    isDirtyRef.current = isDirty
    const flushCommitRef = useRef(flushCommit)
    flushCommitRef.current = flushCommit
    const itemIdRef = useRef(item.id)
    itemIdRef.current = item.id
    const resolveCommitTransformRef = useRef(resolveCommitTransform)
    resolveCommitTransformRef.current = resolveCommitTransform

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
        if (!isDirtyRef.current) return
        flushCommitRef.current(workingRef.current)
        isDirtyRef.current = false
      },
    }))

    // unmount = pane navigation or modal close; auto-flush so users don't lose
    // a pending edit by hitting Done or scrolling to a different item
    useEffect(
      () => () =>
      {
        if (isDirtyRef.current) flushCommitRef.current(workingRef.current)
      },
      []
    )

    const canvasW =
      boardAspectRatio >= 1 ? CANVAS_BOUND : CANVAS_BOUND * boardAspectRatio
    const canvasH =
      boardAspectRatio >= 1 ? CANVAS_BOUND / boardAspectRatio : CANVAS_BOUND

    const getFitBaselineZoom = useCallback(
      (rotation: ItemRotation) =>
        createFitBaselineTransform(
          item,
          boardAspectRatio,
          effectiveFit,
          rotation
        ).zoom,
      [item, boardAspectRatio, effectiveFit]
    )

    // drag-to-pan — cell-relative offset deltas match crop positioning
    const dragRef = useRef<{
      startX: number
      startY: number
      baseOffX: number
      baseOffY: number
      moved: boolean
    } | null>(null)

    const onPointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) =>
      {
        if (e.button !== 0 || !url) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        setIsDragging(true)
        dragRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          baseOffX: working.offsetX,
          baseOffY: working.offsetY,
          moved: false,
        }
      },
      [working.offsetX, working.offsetY, url]
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
          if (Math.abs(nextOffsetX) < thresholdX)
          {
            nextOffsetX = 0
            snapX = true
          }
          if (Math.abs(nextOffsetY) < thresholdY)
          {
            nextOffsetY = 0
            snapY = true
          }
        }
        setSnap((prev) =>
          prev.x === snapX && prev.y === snapY ? prev : { x: snapX, y: snapY }
        )
        setWorking((w) =>
          clampItemTransform({
            ...w,
            offsetX: nextOffsetX,
            offsetY: nextOffsetY,
          })
        )
      },
      [canvasW, canvasH]
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
        setWorking({
          ...working,
          rotation,
          zoom: displayZoom * getFitBaselineZoom(rotation),
        })
      },
      [working, getFitBaselineZoom]
    )

    const setZoomLive = useCallback(
      (zoom: number) =>
        setWorking((w) =>
          clampItemTransform({
            ...w,
            zoom: zoom * getFitBaselineZoom(w.rotation),
          })
        ),
      [getFitBaselineZoom]
    )

    const reset = useCallback(() =>
    {
      setWorking(fitBaseline)
    }, [fitBaseline])

    const confirm = useCallback(() =>
    {
      flushCommit(working)
    }, [flushCommit, working])

    const centerOffsets = useCallback(() =>
    {
      setWorking((w) => clampItemTransform({ ...w, offsetX: 0, offsetY: 0 }))
    }, [])

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
        setWorking(
          resolveAutoCropTransform(
            item,
            bbox,
            boardAspectRatio,
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
      boardAspectRatio,
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
        setWorking((w) =>
          clampItemTransform({
            ...w,
            offsetX: w.offsetX + dxPx / canvasW,
            offsetY: w.offsetY + dyPx / canvasH,
          })
        )
      }
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }, [url, canvasW, canvasH])

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
        setWorking((w) =>
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
    }, [url, getFitBaselineZoom])

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
          boardAspectRatio,
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
          boardAspectRatio,
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
      ? 'border-amber-400/40 bg-amber-400/10 text-amber-200'
      : 'border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] text-[var(--t-text-muted)]'

    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--t-border-secondary)] px-5 py-2 text-xs text-[var(--t-text-muted)]">
          <span className="truncate font-medium text-[var(--t-text-secondary)]">
            {item.label ?? 'Untitled'}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 tabular-nums ${ratioBadgeClass}`}
            title={
              mismatched
                ? `Item ${ratioLabel} doesn't match board ${boardRatioLabel}`
                : `Item & board both ${boardRatioLabel}`
            }
          >
            <span>{ratioLabel}</span>
            <span aria-hidden="true">-&gt;</span>
            <span>{boardRatioLabel}</span>
          </span>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--t-bg-sunken)] p-6">
          <div
            ref={canvasRef}
            className="relative overflow-hidden rounded border border-[var(--t-border-secondary)] bg-black/20 select-none"
            style={{
              width: canvasW,
              height: canvasH,
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
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--t-border-secondary)] px-5 py-3">
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
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => rotate(90)}
              className="focus-custom rounded p-1.5 text-[var(--t-text-muted)] hover:bg-[var(--t-bg-surface)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
              aria-label="Rotate right 90 degrees"
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
            aria-label={
              autoCropApplied ? 'Auto-crop applied' : 'Auto-crop to content'
            }
            title={
              autoCropApplied
                ? 'Auto-crop is applied'
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
          >
            <RefreshCw className="h-3 w-3" />
            Reset
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!isDirty}
            aria-label={
              isDirty ? 'Confirm changes' : 'No pending changes to confirm'
            }
            title={
              isDirty
                ? 'Save these adjustments to this item'
                : 'No pending changes'
            }
            className={`focus-custom inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] ${
              isDirty
                ? 'border-[var(--t-accent)] bg-[var(--t-accent)] text-[var(--t-accent-foreground)] enabled:hover:brightness-110'
                : 'border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] text-[var(--t-text-muted)]'
            }`}
          >
            <Check className="h-3 w-3" />
            Confirm
          </button>
          <div className="ml-auto flex items-center gap-2">
            <SecondaryButton
              onClick={onPrev}
              disabled={!canPrev}
              variant="surface"
              size="sm"
            >
              Prev
            </SecondaryButton>
            <SecondaryButton
              onClick={onNext}
              disabled={!canNext}
              variant="surface"
              size="sm"
            >
              Next
            </SecondaryButton>
          </div>
        </div>
      </div>
    )
  }
)

interface ZoomSliderProps
{
  value: number
  min: number
  sliderMax: number
  onLiveChange: (value: number) => void
}

// HTML range input fires onChange on every value tick; only working state
// updates here — saving goes through the explicit Confirm button
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
  const [draftPercent, setDraftPercent] = useState<string | null>(null)
  const visiblePercent = draftPercent ?? String(percentValue)
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

  const commitPercentInput = useCallback(() =>
  {
    const parsed = parsePercentInput(visiblePercent)
    const nextPercent =
      parsed === null
        ? percentValue
        : clamp(Math.round(parsed), percentMin, percentMax)

    setDraftPercent(null)
    onLiveChange(nextPercent / 100)
  }, [percentMax, percentMin, percentValue, visiblePercent, onLiveChange])

  const resetPercentInput = useCallback(() =>
  {
    setDraftPercent(null)
  }, [])

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
      <label className="flex h-7 items-center rounded border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-2 text-[var(--t-text-muted)] focus-within:border-[var(--t-border-hover)] focus-within:ring-2 focus-within:ring-[var(--t-accent)]">
        <input
          type="text"
          value={visiblePercent}
          onChange={(e) => setDraftPercent(e.target.value)}
          onFocus={(e) =>
          {
            setDraftPercent(String(percentValue))
            e.currentTarget.select()
          }}
          onBlur={commitPercentInput}
          onKeyDown={(e) =>
          {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') resetPercentInput()
          }}
          inputMode="numeric"
          className="w-9 bg-transparent text-right tabular-nums text-[var(--t-text)] outline-none [appearance:textfield]"
          aria-label="Zoom percent"
          spellCheck={false}
        />
        <span aria-hidden="true" className="pl-0.5">
          %
        </span>
      </label>
    </div>
  )
}
