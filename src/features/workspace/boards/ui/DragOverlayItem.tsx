// src/features/workspace/boards/ui/DragOverlayItem.tsx
// ghost item rendered in the dnd-kit DragOverlay while dragging

import { memo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { TierItem as TierItemType } from '@tierlistbuilder/contracts/workspace/board'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import { ITEM_SIZE_PX, SHAPE_CLASS } from '~/shared/board-ui/constants'
import { ItemContent } from '~/shared/board-ui/ItemContent'

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
    const { itemSize, itemShape } = useSettingsStore(
      useShallow((state) => ({
        itemSize: state.itemSize,
        itemShape: state.itemShape,
      }))
    )
    const sizePx = ITEM_SIZE_PX[itemSize]
    const shapeClass = SHAPE_CLASS[itemShape]

    return (
      <div className="relative" style={{ width: sizePx, height: sizePx }}>
        {/* stacked shadow cards behind the primary item */}
        {groupCount > 0 && (
          <>
            <div
              className={`absolute inset-0 border border-[var(--t-border)] bg-[var(--t-bg-overlay)] ${shapeClass}`}
              style={{
                transform: 'translate(6px, 6px)',
                width: sizePx,
                height: sizePx,
              }}
            />
            {groupCount > 1 && (
              <div
                className={`absolute inset-0 border border-[var(--t-border-secondary)] bg-[var(--t-bg-sunken)] ${shapeClass}`}
                style={{
                  transform: 'translate(10px, 10px)',
                  width: sizePx,
                  height: sizePx,
                }}
              />
            )}
          </>
        )}

        {/* primary item */}
        <div
          className={`relative overflow-hidden border border-[var(--t-border-hover)] bg-[var(--t-bg-overlay)] shadow-xl ${shapeClass}`}
          style={{ width: sizePx, height: sizePx }}
        >
          <ItemContent item={item} />

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
