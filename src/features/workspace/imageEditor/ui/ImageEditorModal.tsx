// src/features/workspace/imageEditor/ui/ImageEditorModal.tsx
// master-detail editor for per-item rotation, zoom, & pan transforms; crop
// frame locks to the board aspect ratio so the preview matches the tier rows

import {
  useCallback,
  useEffect,
  useId,
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
import { mapAsyncLimit } from '~/shared/lib/asyncMapLimit'
import {
  detectContentBBox,
  areCachedAutoCropsApplied,
  getAutoCropCacheVersion,
  getAutoCropHash,
  getCachedBBox,
  resolveAutoCropTransform,
  subscribeAutoCropCache,
} from '~/shared/lib/autoCrop'
import { getBlob } from '~/shared/images/imageStore'
import { warmImageHashes } from '~/shared/images/imageBlobCache'
import { BaseModal } from '~/shared/overlay/BaseModal'
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

// display-zoom bounds for the slider & percent input (independent of the
// per-item baseline, so the UI floor/ceiling stay at 1% / 250%)
const SLIDER_ZOOM_MIN = 0.01
const SLIDER_ZOOM_MAX = 2.5
const ZOOM_SLIDER_STEP = 0.01

const PAN_START_THRESHOLD_PX = 4
// snap-to-center bypassed when Alt is held; threshold is per axis
const PAN_SNAP_THRESHOLD_PX = 5
// coalesces a held arrow or a wheel burst into one undo entry
const GESTURE_COMMIT_DEBOUNCE_MS = 250
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

  // auto-crop scope tracks the visible filter so cropping done in the issue
  // modal (mismatched-only) carries over to the Mismatched view here
  const handleAutoCropAll = useCallback(async () =>
  {
    const targets = filteredItems.filter((it) => !!getAutoCropHash(it))
    if (targets.length === 0) return
    setAutoCropProgress({ running: true, done: 0, total: targets.length })
    try
    {
      const entries = await mapAsyncLimit(targets, 4, async (it) =>
      {
        const hash = getAutoCropHash(it)!
        let bbox = getCachedBBox(hash)
        if (bbox === undefined)
        {
          const record = await getBlob(hash)
          bbox = record ? await detectContentBBox(record.bytes, hash) : null
        }
        setAutoCropProgress((p) => (p.running ? { ...p, done: p.done + 1 } : p))
        if (!bbox) return null
        const transform = resolveAutoCropTransform(it, bbox, boardAspectRatio)
        return { id: it.id, transform } as {
          id: ItemId
          transform: ItemTransform | null
        }
      })
      const cropped = entries.filter(
        (entry): entry is { id: ItemId; transform: ItemTransform | null } =>
          entry !== null
      )
      if (cropped.length > 0) setItemsTransform(cropped)
    }
    finally
    {
      setAutoCropProgress({ running: false, done: 0, total: 0 })
    }
  }, [filteredItems, boardAspectRatio, setItemsTransform])

  const autoCropAllApplied = useMemo(() =>
  {
    void autoCropCacheVersion
    if (autoCropProgress.running) return false
    return areCachedAutoCropsApplied(filteredItems, boardAspectRatio)
  }, [
    autoCropCacheVersion,
    autoCropProgress.running,
    boardAspectRatio,
    filteredItems,
  ])

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
        height: 'calc(100dvh - 2rem)',
        maxWidth: 'none',
        overflowY: 'hidden',
        width: 'min(1280px, calc(100vw - 2rem))',
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
        onAutoCropAll={handleAutoCropAll}
        autoCropProgress={autoCropProgress}
        autoCropAllApplied={autoCropAllApplied}
      />
      <div className="flex min-h-0 flex-1">
        <ImageEditorRail
          filter={filter}
          onFilterChange={setFilter}
          items={filteredItems}
          totalCount={allImageItems.length}
          boardAspectRatio={boardAspectRatio}
          selectedId={selectedId}
          onSelect={setPickedId}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          {selectedItem ? (
            <ImageEditorPane
              key={`${selectedItem.id}:${transformKey(selectedItem.transform)}:${boardAspectRatio}:${getEffectiveImageFit(selectedItem, boardDefaultFit)}`}
              item={selectedItem}
              boardAspectRatio={boardAspectRatio}
              boardDefaultFit={boardDefaultFit}
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
    </BaseModal>
  )
}

interface BoardControlsBarProps
{
  ratioPicker: ReturnType<typeof useBoardAspectRatioPicker>
  onAutoCropAll: () => void
  autoCropProgress: { running: boolean; done: number; total: number }
  autoCropAllApplied: boolean
}

// board-wide controls — board ratio chips plus crop actions for the editor
const BoardControlsBar = ({
  ratioPicker,
  onAutoCropAll,
  autoCropProgress,
  autoCropAllApplied,
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
    <div className="flex items-center gap-2">
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
  selectedId: ItemId | null
  onSelect: (id: ItemId) => void
}

const ImageEditorRail = ({
  filter,
  onFilterChange,
  items,
  totalCount,
  boardAspectRatio,
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
  selected: boolean
  onSelect: () => void
}

const ImageEditorRailRow = ({
  item,
  boardAspectRatio,
  selected,
  onSelect,
}: ImageEditorRailRowProps) =>
{
  const url = useImageUrl(item.imageRef?.hash)
  const mismatched = itemHasAspectMismatch(item, boardAspectRatio)
  const adjusted = !!item.transform && !isIdentityTransform(item.transform)
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
        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded border border-[var(--t-border-secondary)] bg-[var(--t-bg-sunken)]">
          {url && (
            <img
              src={url}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          )}
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
  onCommit: (transform: ItemTransform | null) => void
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
}

// editor state is held locally during a single drag/slider interaction so we
// only push one undo entry per gesture; buttons commit immediately because
// they're already discrete actions
const ImageEditorPane = ({
  item,
  boardAspectRatio,
  boardDefaultFit,
  onCommit,
  canPrev,
  canNext,
  onPrev,
  onNext,
}: ImageEditorPaneProps) =>
{
  const sourceUrl = useImageUrl(item.sourceImageRef?.hash)
  const displayUrl = useImageUrl(item.imageRef?.hash)
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
  const autoCropResult = getCachedBBox(autoCropHash)

  useEffect(() =>
  {
    if (!item.sourceImageRef?.hash || sourceUrl) return
    void warmImageHashes([item.sourceImageRef.hash])
  }, [item.sourceImageRef?.hash, sourceUrl])

  // arrow-key & wheel gestures fire many micro-updates; we coalesce them
  // into a single commit per gesture so undo history stays usable
  const pendingCommitRef = useRef<{
    timer: number | null
    transform: ItemTransform | null
  }>({ timer: null, transform: null })

  const cancelPendingCommit = useCallback(() =>
  {
    const pending = pendingCommitRef.current
    if (pending.timer !== null)
    {
      clearTimeout(pending.timer)
      pending.timer = null
    }
    pending.transform = null
  }, [])

  // discrete commits (drag end, slider end, rotate, reset, center) supersede
  // any in-flight debounced gesture, so we drop pending instead of flushing
  const flushCommit = useCallback(
    (transform: ItemTransform) =>
    {
      cancelPendingCommit()
      const clamped = clampItemTransform(transform)
      onCommit(isSameItemTransform(clamped, fitBaseline) ? null : clamped)
    },
    [onCommit, fitBaseline, cancelPendingCommit]
  )

  const flushPendingCommit = useCallback(() =>
  {
    const pending = pendingCommitRef.current
    if (pending.timer === null) return
    clearTimeout(pending.timer)
    pending.timer = null
    const t = pending.transform
    pending.transform = null
    if (t) flushCommit(t)
  }, [flushCommit])

  const scheduleCommit = useCallback(
    (transform: ItemTransform) =>
    {
      const pending = pendingCommitRef.current
      pending.transform = transform
      if (pending.timer !== null) clearTimeout(pending.timer)
      pending.timer = window.setTimeout(() =>
      {
        const t = pending.transform
        pending.timer = null
        pending.transform = null
        if (t) flushCommit(t)
      }, GESTURE_COMMIT_DEBOUNCE_MS)
    },
    [flushCommit]
  )

  // pane remounts mean the baseline changed; avoid resaving stale nudges.
  // explicit pane navigation flushes pending gesture commits first
  useEffect(
    () => () =>
    {
      cancelPendingCommit()
    },
    [cancelPendingCommit]
  )

  const canvasW =
    boardAspectRatio >= 1 ? CANVAS_BOUND : CANVAS_BOUND * boardAspectRatio
  const canvasH =
    boardAspectRatio >= 1 ? CANVAS_BOUND / boardAspectRatio : CANVAS_BOUND

  const getFitBaselineZoom = useCallback(
    (rotation: ItemRotation) =>
      createFitBaselineTransform(item, boardAspectRatio, effectiveFit, rotation)
        .zoom,
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
      if (!drag.moved && Math.hypot(deltaX, deltaY) < PAN_START_THRESHOLD_PX)
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
      if (!drag.moved) return
      setWorking((w) =>
      {
        flushCommit(w)
        return w
      })
    },
    [flushCommit]
  )

  const rotate = useCallback(
    (delta: 90 | -90) =>
    {
      const currentBaselineZoom = getFitBaselineZoom(working.rotation)
      const displayZoom = working.zoom / currentBaselineZoom
      const rotation = normalizeRotation(working.rotation + delta)
      const next: ItemTransform = {
        ...working,
        rotation,
        zoom: displayZoom * getFitBaselineZoom(rotation),
      }
      setWorking(next)
      flushCommit(next)
    },
    [working, flushCommit, getFitBaselineZoom]
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

  const commitWorking = useCallback(
    () =>
      setWorking((w) =>
      {
        flushCommit(w)
        return w
      }),
    [flushCommit]
  )

  const reset = useCallback(() =>
  {
    const next = fitBaseline
    setWorking(next)
    flushCommit(next)
  }, [fitBaseline, flushCommit])

  const goPrev = useCallback(() =>
  {
    flushPendingCommit()
    onPrev()
  }, [flushPendingCommit, onPrev])

  const goNext = useCallback(() =>
  {
    flushPendingCommit()
    onNext()
  }, [flushPendingCommit, onNext])

  const centerOffsets = useCallback(() =>
  {
    setWorking((w) =>
    {
      const next = clampItemTransform({ ...w, offsetX: 0, offsetY: 0 })
      flushCommit(next)
      return next
    })
  }, [flushCommit])

  const autoCrop = useCallback(async () =>
  {
    if (!autoCropHash || autoCropping) return
    setAutoCropping(true)
    try
    {
      let bbox = getCachedBBox(autoCropHash)
      if (bbox === undefined)
      {
        const record = await getBlob(autoCropHash)
        if (!record) return
        bbox = await detectContentBBox(record.bytes, autoCropHash)
      }
      if (!bbox) return
      const next = resolveAutoCropTransform(
        item,
        bbox,
        boardAspectRatio,
        working.rotation
      )
      setWorking(next)
      flushCommit(next)
    }
    finally
    {
      setAutoCropping(false)
    }
  }, [
    autoCropHash,
    autoCropping,
    item,
    boardAspectRatio,
    working.rotation,
    flushCommit,
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
      {
        const next = clampItemTransform({
          ...w,
          offsetX: w.offsetX + dxPx / canvasW,
          offsetY: w.offsetY + dyPx / canvasH,
        })
        scheduleCommit(next)
        return next
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [url, canvasW, canvasH, scheduleCommit])

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
        const next = clampItemTransform({
          ...w,
          zoom: nextZoom,
          offsetX: cursorFracX - actualFactor * (cursorFracX - w.offsetX),
          offsetY: cursorFracY - actualFactor * (cursorFracY - w.offsetY),
        })
        scheduleCommit(next)
        return next
      })
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [url, scheduleCommit, getFitBaselineZoom])

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--t-border-secondary)] px-5 py-2 text-xs text-[var(--t-text-muted)]">
        <span className="truncate font-medium text-[var(--t-text-secondary)]">
          {item.label ?? 'Untitled'}
        </span>
        <span>
          Item {ratioLabel} · Board {formatAspectRatio(boardAspectRatio)}
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
          onCommit={commitWorking}
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
                ? 'No crop detected — image fills its frame'
                : 'Frame the detected content'
          }
        />
        <button
          type="button"
          onClick={reset}
          disabled={!hasChanges}
          className="focus-custom inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--t-text-muted)] enabled:hover:text-[var(--t-text)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
        >
          <RefreshCw className="h-3 w-3" />
          Reset
        </button>
        <div className="ml-auto flex items-center gap-2">
          <SecondaryButton
            onClick={goPrev}
            disabled={!canPrev}
            variant="surface"
            size="sm"
          >
            Prev
          </SecondaryButton>
          <SecondaryButton
            onClick={goNext}
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

interface ZoomSliderProps
{
  value: number
  min: number
  sliderMax: number
  onLiveChange: (value: number) => void
  onCommit: () => void
}

// HTML range input fires onChange on every value tick; we use those for the
// live preview & commit on pointer/key release so each drag is one undo entry
const ZoomSlider = ({
  value,
  min,
  sliderMax,
  onLiveChange,
  onCommit,
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
    onCommit()
  }, [
    percentMax,
    percentMin,
    percentValue,
    visiblePercent,
    onLiveChange,
    onCommit,
  ])

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
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
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
