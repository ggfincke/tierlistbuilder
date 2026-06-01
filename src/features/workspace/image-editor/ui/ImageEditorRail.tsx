// src/features/workspace/image-editor/ui/ImageEditorRail.tsx
// left rail for filtering, selecting, & previewing image-editor items

import { memo, useMemo } from 'react'
import { Check, Crop, EyeOff, Pause } from 'lucide-react'

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import type {
  BoardLabelSettings,
  GlobalLabelDefaults,
  ImageFit,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  formatAspectRatio,
  getEffectiveImageFit,
  itemHasAspectMismatch,
} from '~/shared/board-ui/aspectRatio'
import { ItemContent } from '~/shared/board-ui/ItemContent'
import { resolveLabelLayout } from '~/shared/board-ui/labels/labelDisplay'
import { isIdentityTransform } from '~/shared/lib/imageTransform'
import {
  boundedAspectSize,
  RAIL_THUMBNAIL_BOUND,
} from '~/features/workspace/image-editor/lib/imageEditorGeometry'
import type { ImageEditorFilter } from '~/features/workspace/image-editor/model/useImageEditorStore'

const FILTER_OPTIONS: { value: ImageEditorFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'mismatched', label: 'Mismatched' },
  { value: 'adjusted', label: 'Adjusted' },
]

interface ImageEditorRailProps
{
  filter: ImageEditorFilter
  onFilterChange: (f: ImageEditorFilter) => void
  items: readonly TierItem[]
  totalCount: number
  boardAspectRatio: number
  boardDefaultFit: ImageFit | undefined
  boardLabels: BoardLabelSettings | undefined
  globalLabelDefaults: GlobalLabelDefaults
  selectedId: ItemId | null
  onSelect: (id: ItemId) => void
  isSkipped: (id: ItemId) => boolean
}

interface RailLabelStatus
{
  labelHidden: boolean
  hasLabelOverride: boolean
}

const DEFAULT_LABEL_STATUS: RailLabelStatus = {
  labelHidden: false,
  hasLabelOverride: false,
}

export const ImageEditorRail = ({
  filter,
  onFilterChange,
  items,
  totalCount,
  boardAspectRatio,
  boardDefaultFit,
  boardLabels,
  globalLabelDefaults,
  selectedId,
  onSelect,
  isSkipped,
}: ImageEditorRailProps) =>
{
  const thumbnailSize = useMemo(
    () => boundedAspectSize(boardAspectRatio, RAIL_THUMBNAIL_BOUND),
    [boardAspectRatio]
  )
  const labelStatusById = useMemo(() =>
  {
    const statuses = new Map<ItemId, RailLabelStatus>()
    for (const item of items)
    {
      const labelLayout = resolveLabelLayout({
        itemOptions: item.labelOptions,
        boardSettings: boardLabels,
        globalLabelDefaults,
      })
      statuses.set(item.id, {
        labelHidden: !labelLayout.visible,
        hasLabelOverride: !!item.labelOptions,
      })
    }
    return statuses
  }, [boardLabels, globalLabelDefaults, items])

  return (
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
          title="Item ratio differs from the board - needs cropping or a new ratio"
        >
          <Crop
            aria-hidden="true"
            className="h-2.5 w-2.5 text-[var(--t-warning)]"
          />
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
          title="Caption is hidden for this item - either inherited or per-tile override"
        >
          <EyeOff
            aria-hidden="true"
            className="h-2.5 w-2.5 text-[var(--t-text-faint)]"
          />
          label hidden
        </span>
        <span
          className="inline-flex items-center gap-1"
          title="You skipped this item - Smart Next won't loop back to it. Click the row to revisit."
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
            thumbnailSize={thumbnailSize}
            labelStatus={labelStatusById.get(item.id) ?? DEFAULT_LABEL_STATUS}
            selected={item.id === selectedId}
            skipped={isSkipped(item.id)}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </aside>
  )
}

interface ImageEditorRailRowProps
{
  item: TierItem
  boardAspectRatio: number
  boardDefaultFit: ImageFit | undefined
  thumbnailSize: { width: number; height: number }
  labelStatus: RailLabelStatus
  selected: boolean
  skipped: boolean
  onSelect: (id: ItemId) => void
}

const ImageEditorRailRow = memo(
  ({
    item,
    boardAspectRatio,
    boardDefaultFit,
    thumbnailSize,
    labelStatus,
    selected,
    skipped,
    onSelect,
  }: ImageEditorRailRowProps) =>
  {
    const mismatched = itemHasAspectMismatch(item, boardAspectRatio)
    const adjusted = !!item.transform && !isIdentityTransform(item.transform)
    const { hasLabelOverride, labelHidden } = labelStatus
    const effectiveFit = getEffectiveImageFit(item, boardDefaultFit)

    return (
      <li>
        <button
          type="button"
          onClick={() => onSelect(item.id)}
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
                imageRendition="thumbnail"
              />
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">
              {item.label ?? 'Untitled'}
            </span>
            <span className="tabular-nums text-[var(--t-text-faint)]">
              {item.aspectRatio ? formatAspectRatio(item.aspectRatio) : '-'}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span
              className="inline-flex h-3 w-3 items-center justify-center"
              title={
                mismatched
                  ? `Aspect ratio mismatch - item is ${
                      item.aspectRatio
                        ? formatAspectRatio(item.aspectRatio)
                        : '?'
                    } vs board ${formatAspectRatio(boardAspectRatio)}`
                  : undefined
              }
              aria-label={mismatched ? 'Aspect ratio mismatch' : undefined}
              aria-hidden={mismatched ? undefined : 'true'}
            >
              {mismatched && (
                <Crop
                  aria-hidden="true"
                  className="h-3 w-3 text-[var(--t-warning)]"
                />
              )}
            </span>
            <span
              className="inline-flex h-3 w-3 items-center justify-center"
              title={
                adjusted
                  ? 'Manually adjusted (rotate / zoom / pan)'
                  : skipped
                    ? "Skipped - you deferred this item. Smart Next won't loop back here."
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
                <span className="block h-1.5 w-1.5 rounded-full bg-[var(--t-success)]" />
              ) : null}
            </span>
          </div>
        </button>
      </li>
    )
  }
)
ImageEditorRailRow.displayName = 'ImageEditorRailRow'
