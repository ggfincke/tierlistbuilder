// src/features/workspace/boards/ui/DragOverlayItem.tsx
// ghost item rendered in the dnd-kit DragOverlay while dragging

import { memo, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { TierItem as TierItemType } from '@tierlistbuilder/contracts/workspace/board'
import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { createSelectBoardItemById } from '~/features/workspace/boards/model/slices/selectors'
import {
  getBoardItemAspectRatio,
  getEffectiveImageFit,
} from '~/shared/board-ui/aspectRatio'
import { itemSlotDimensions, SHAPE_CLASS } from '~/shared/board-ui/constants'
import { ItemContent } from '~/shared/board-ui/ItemContent'
import { resolveLabelDisplay } from '~/shared/board-ui/labelDisplay'

interface DragOverlayItemProps
{
  item: TierItemType
  groupCount?: number
}

interface ActiveDragOverlayItemProps
{
  itemId: ItemId
  groupCount?: number
}

export const ActiveDragOverlayItem = memo(
  ({ itemId, groupCount = 0 }: ActiveDragOverlayItemProps) =>
  {
    const selectItem = useMemo(
      () => createSelectBoardItemById(itemId),
      [itemId]
    )
    const item = useActiveBoardStore(selectItem)

    if (!item)
    {
      return null
    }

    return <DragOverlayItem item={item} groupCount={groupCount} />
  }
)

export const DragOverlayItem = memo(
  ({ item, groupCount = 0 }: DragOverlayItemProps) =>
  {
    const { itemSize, itemShape, showLabels } = useSettingsStore(
      useShallow((state) => ({
        itemSize: state.itemSize,
        itemShape: state.itemShape,
        showLabels: state.showLabels,
      }))
    )
    const boardAspectRatio = useActiveBoardStore((state) =>
      getBoardItemAspectRatio(state)
    )
    const boardDefaultFit = useActiveBoardStore(
      (state) => state.defaultItemImageFit
    )
    const boardLabels = useActiveBoardStore((state) => state.labels)
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

        <div
          className={`relative overflow-hidden border border-[var(--t-border-hover)] bg-[var(--t-bg-overlay)] shadow-xl ${shapeClass}`}
          style={{ width: slotWidth, height: slotHeight }}
        >
          <ItemContent
            item={item}
            label={resolveLabelDisplay({
              itemLabel: item.label,
              itemOptions: item.labelOptions,
              boardSettings: boardLabels,
              globalShowLabels: showLabels,
            })}
            fit={effectiveFit}
            frameAspectRatio={boardAspectRatio}
          />

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
