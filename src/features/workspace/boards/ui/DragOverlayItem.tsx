// src/features/workspace/boards/ui/DragOverlayItem.tsx
// ghost item rendered in the dnd-kit DragOverlay while dragging

import { memo } from 'react'
import type { TierItem as TierItemType } from '@/features/workspace/boards/model/contract'
import { useSettingsStore } from '@/features/workspace/settings/model/useSettingsStore'
import { useActiveBoardStore } from '@/features/workspace/boards/model/useActiveBoardStore'
import {
  getBoardItemAspectRatio,
  getEffectiveImageFit,
} from '@/features/workspace/boards/lib/aspectRatio'
import { itemSlotDimensions, SHAPE_CLASS } from '@/shared/board-ui/constants'
import { ItemContent } from '@/shared/board-ui/ItemContent'

interface DragOverlayItemProps
{
  // the primary item being dragged
  item: TierItemType
  // number of additional items in the drag group
  groupCount?: number
}

export const DragOverlayItem = memo(
  ({ item, groupCount = 0 }: DragOverlayItemProps) =>
  {
    const itemSize = useSettingsStore((state) => state.itemSize)
    const itemShape = useSettingsStore((state) => state.itemShape)
    const boardAspectRatio = useActiveBoardStore((state) =>
      getBoardItemAspectRatio(state)
    )
    const boardDefaultFit = useActiveBoardStore(
      (state) => state.defaultItemImageFit
    )
    const { width: slotWidth, height: slotHeight } = itemSlotDimensions(
      itemSize,
      boardAspectRatio
    )
    const shapeClass = SHAPE_CLASS[itemShape]
    const effectiveFit = getEffectiveImageFit(item, boardDefaultFit)

    return (
      <div
        className="relative"
        style={{ width: slotWidth, height: slotHeight }}
      >
        {/* stacked shadow cards behind the primary item */}
        {groupCount > 0 && (
          <>
            <div
              className={`absolute inset-0 border border-[var(--t-border)] bg-[var(--t-bg-overlay)] ${shapeClass}`}
              style={{
                transform: 'translate(6px, 6px)',
                width: slotWidth,
                height: slotHeight,
              }}
            />
            {groupCount > 1 && (
              <div
                className={`absolute inset-0 border border-[var(--t-border-secondary)] bg-[var(--t-bg-sunken)] ${shapeClass}`}
                style={{
                  transform: 'translate(10px, 10px)',
                  width: slotWidth,
                  height: slotHeight,
                }}
              />
            )}
          </>
        )}

        {/* primary item */}
        <div
          className={`relative overflow-hidden border border-[var(--t-border-hover)] bg-[var(--t-bg-overlay)] shadow-xl ${shapeClass}`}
          style={{ width: slotWidth, height: slotHeight }}
        >
          <ItemContent item={item} fit={effectiveFit} />

          {/* count badge */}
          {groupCount > 0 && (
            <span className="absolute top-0 right-0 z-10 flex h-5 min-w-5 items-center justify-center rounded-bl-md bg-[var(--t-accent)] px-1 text-[10px] font-bold text-[var(--t-accent-foreground)] shadow">
              {groupCount + 1}
            </span>
          )}
        </div>
      </div>
    )
  }
)
