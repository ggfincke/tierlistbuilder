// src/features/workspace/imageEditor/ui/ImageEditorModal.tsx
// master-detail editor for per-item rotation, zoom, & pan transforms; crop
// frame locks to the board aspect ratio so the preview matches the tier rows

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { RefreshCw, RotateCcw, RotateCw } from 'lucide-react'
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
import { SegmentedControl } from '~/features/workspace/settings/ui/SegmentedControl'
import { useImageUrl } from '~/shared/hooks/useImageUrl'
import {
  clampItemTransform,
  isIdentityTransform,
  isSameItemTransform,
  itemTransformToCropCss,
  resolveManualCropFitZoom,
  resolveManualCropImageSize,
} from '~/shared/lib/imageTransform'
import { clamp } from '~/shared/lib/math'
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

// upper end of the zoom slider — contract allows up to 10x but the slider
// caps at 5x for usable resolution; users can still type-in past this if
// the contract limit ever surfaces in a programmatic flow
const SLIDER_ZOOM_MAX = 5

const PAN_START_THRESHOLD_PX = 4

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
    boardDefaultFit,
    setDefaultItemImageFit,
    setItemsImageFit,
  } = useActiveBoardStore(
    useShallow((s) => ({
      items: s.items,
      tiers: s.tiers,
      unrankedItemIds: s.unrankedItemIds,
      boardAspectRatio: getBoardItemAspectRatio(s),
      setItemTransform: s.setItemTransform,
      boardDefaultFit: s.defaultItemImageFit,
      setDefaultItemImageFit: s.setDefaultItemImageFit,
      setItemsImageFit: s.setItemsImageFit,
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

  const handleSetAllFit = useCallback(
    (fit: ImageFit) =>
    {
      const ids = allImageItems
        .filter((it) => itemHasAspectMismatch(it, boardAspectRatio))
        .map((it) => it.id)
      if (ids.length > 0) setItemsImageFit(ids, fit)
      setDefaultItemImageFit(fit)
    },
    [allImageItems, boardAspectRatio, setItemsImageFit, setDefaultItemImageFit]
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
      panelClassName="w-full p-0"
      panelStyle={{ maxWidth: 960 }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[var(--t-border-secondary)] px-5 py-3">
        <ModalHeader titleId={titleId}>Edit images</ModalHeader>
        <SecondaryButton onClick={close} variant="surface" size="sm">
          Done
        </SecondaryButton>
      </div>
      <BoardControlsBar
        ratioPicker={ratioPicker}
        boardDefaultFit={boardDefaultFit}
        onSetAllFit={handleSetAllFit}
      />
      <div className="flex h-[min(64dvh,560px)]">
        <ImageEditorRail
          filter={filter}
          onFilterChange={setFilter}
          items={filteredItems}
          totalCount={allImageItems.length}
          boardAspectRatio={boardAspectRatio}
          selectedId={selectedId}
          onSelect={setPickedId}
        />
        <div className="flex flex-1 flex-col">
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
  boardDefaultFit: ImageFit | undefined
  onSetAllFit: (fit: ImageFit) => void
}

// board-wide controls — board ratio chips + Cover/Contain bulk fit; mirror
// the AspectRatioSection wiring so changes here & in settings stay aligned
const BoardControlsBar = ({
  ratioPicker,
  boardDefaultFit,
  onSetAllFit,
}: BoardControlsBarProps) => (
  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--t-border-secondary)] bg-[var(--t-bg-page)] px-5 py-2">
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-[var(--t-text-muted)]">
        Board ratio
      </span>
      <AspectRatioChips
        selectedOption={ratioPicker.selectedOption}
        onSelect={ratioPicker.handleOption}
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
    <SegmentedControl<ImageFit>
      ariaLabel="Set fit for all mismatched items"
      options={[
        { value: 'cover', label: 'Cover all' },
        { value: 'contain', label: 'Contain all' },
      ]}
      value={boardDefaultFit ?? 'cover'}
      onChange={onSetAllFit}
    />
  </div>
)

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
  <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--t-border-secondary)] bg-[var(--t-bg-page)]">
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

  useEffect(() =>
  {
    if (!item.sourceImageRef?.hash || sourceUrl) return
    void warmImageHashes([item.sourceImageRef.hash])
  }, [item.sourceImageRef?.hash, sourceUrl])

  const flushCommit = useCallback(
    (transform: ItemTransform) =>
    {
      const clamped = clampItemTransform(transform)
      onCommit(isSameItemTransform(clamped, fitBaseline) ? null : clamped)
    },
    [onCommit, fitBaseline]
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
      const dx = deltaX / canvasW
      const dy = deltaY / canvasH
      setWorking((w) =>
        clampItemTransform({
          ...w,
          offsetX: drag.baseOffX + dx,
          offsetY: drag.baseOffY + dy,
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

  const zoomBaseline = getFitBaselineZoom(working.rotation)
  const displayZoom = working.zoom / zoomBaseline
  const displayZoomMin = ITEM_TRANSFORM_LIMITS.zoomMin / zoomBaseline
  const displayZoomMax = Math.min(
    SLIDER_ZOOM_MAX,
    ITEM_TRANSFORM_LIMITS.zoomMax / zoomBaseline
  )
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
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--t-border-secondary)] px-5 py-2 text-xs text-[var(--t-text-muted)]">
        <span className="truncate font-medium text-[var(--t-text-secondary)]">
          {item.label ?? 'Untitled'}
        </span>
        <span>
          Item {ratioLabel} · Board {formatAspectRatio(boardAspectRatio)}
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center bg-[var(--t-bg-sunken)] p-6">
        <div
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
          max={displayZoomMax}
          onLiveChange={setZoomLive}
          onCommit={commitWorking}
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

interface ZoomSliderProps
{
  value: number
  min: number
  max: number
  onLiveChange: (value: number) => void
  onCommit: () => void
}

// HTML range input fires onChange on every value tick; we use those for the
// live preview & commit on pointer/key release so each drag is one undo entry
const ZoomSlider = ({
  value,
  min,
  max,
  onLiveChange,
  onCommit,
}: ZoomSliderProps) => (
  <label className="flex items-center gap-2 text-xs text-[var(--t-text-muted)]">
    <span>Zoom</span>
    <input
      type="range"
      min={min}
      max={max}
      step={0.05}
      value={clamp(value, min, max)}
      onChange={(e) => onLiveChange(Number(e.target.value))}
      onPointerUp={onCommit}
      onKeyUp={onCommit}
      onBlur={onCommit}
      className="w-40 accent-[var(--t-accent)]"
      aria-label="Zoom"
    />
    <span className="w-12 text-right tabular-nums text-[var(--t-text)]">
      {(value * 100).toFixed(0)}%
    </span>
  </label>
)
