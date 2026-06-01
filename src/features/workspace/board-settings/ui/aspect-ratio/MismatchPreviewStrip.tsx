// src/features/workspace/board-settings/ui/aspect-ratio/MismatchPreviewStrip.tsx
// thumbnail strip for items affected by the mixed-ratio prompt

import type {
  BoardLabelSettings,
  GlobalLabelDefaults,
  ImageFit,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import type {
  ItemShape,
  ItemSize,
} from '@tierlistbuilder/contracts/platform/preferences'
import { getEffectiveImageFit } from '~/shared/board-ui/aspectRatio'
import { itemSlotDimensions, SHAPE_CLASS } from '~/shared/board-ui/constants'
import { ItemContent } from '~/shared/board-ui/ItemContent'
import { resolveItemLabel } from '~/shared/board-ui/labels/labelDisplay'

export const MISMATCH_THUMBNAIL_PREVIEW_LIMIT = 4

interface MismatchPreviewStripProps
{
  mismatchedItems: readonly TierItem[]
  boardAspectRatio: number
  boardDefaultFit: ImageFit | undefined
  boardLabels: BoardLabelSettings | undefined
  getBoardAspectRatioForItem: (item: TierItem) => number
  globalLabelDefaults: GlobalLabelDefaults
  pendingBulkFit: ImageFit | null
  slotBound: number
  itemSize: ItemSize
  itemShape: ItemShape
}

export const MismatchPreviewStrip = ({
  mismatchedItems,
  boardAspectRatio,
  boardDefaultFit,
  boardLabels,
  getBoardAspectRatioForItem,
  globalLabelDefaults,
  pendingBulkFit,
  slotBound,
  itemSize,
  itemShape,
}: MismatchPreviewStripProps) =>
{
  const thumbnailItems = mismatchedItems.slice(
    0,
    MISMATCH_THUMBNAIL_PREVIEW_LIMIT
  )
  const remaining = Math.max(0, mismatchedItems.length - thumbnailItems.length)
  if (thumbnailItems.length === 0) return null

  const innerSize = itemSlotDimensions(itemSize, boardAspectRatio)
  const slotStyle = { width: slotBound, height: slotBound }
  const shapeClass = SHAPE_CLASS[itemShape]

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {thumbnailItems.map((item) =>
      {
        const previewItem =
          pendingBulkFit === null ? item : { ...item, transform: undefined }
        const frameAspectRatio = getBoardAspectRatioForItem(item)
        return (
          <div
            key={item.id}
            className="flex shrink-0 items-center justify-center"
            style={slotStyle}
            title={item.label ?? 'Item'}
          >
            <div
              className={`relative overflow-hidden ${shapeClass}`}
              style={innerSize}
            >
              <ItemContent
                item={previewItem}
                fit={
                  pendingBulkFit ?? getEffectiveImageFit(item, boardDefaultFit)
                }
                frameAspectRatio={frameAspectRatio}
                label={resolveItemLabel(item, boardLabels, globalLabelDefaults)}
              />
            </div>
          </div>
        )
      })}
      {remaining > 0 && (
        <div
          aria-hidden="true"
          className="flex shrink-0 items-center justify-center"
          style={slotStyle}
        >
          <div
            className={`flex items-center justify-center overflow-hidden border border-[var(--t-border-secondary)] bg-[var(--t-bg-sunken)] text-sm font-medium text-[var(--t-text-muted)] ${shapeClass}`}
            style={innerSize}
          >
            +{remaining}
          </div>
        </div>
      )}
    </div>
  )
}
