// src/components/board/DragOverlayItem.tsx
// ghost item rendered in the dnd-kit DragOverlay while dragging

import { memo } from 'react'
import type { TierItem as TierItemType } from '../../types'
import { useSettingsStore } from '../../store/useSettingsStore'
import { getTextColor } from '../../utils/color'
import { ITEM_SIZE_PX, SHAPE_CLASS } from '../../utils/constants'

interface DragOverlayItemProps
{
  // the item being dragged
  item: TierItemType
}

export const DragOverlayItem = memo(({ item }: DragOverlayItemProps) =>
{
  const bgColor = item.backgroundColor ?? '#444'
  const itemSize = useSettingsStore((state) => state.itemSize)
  const itemShape = useSettingsStore((state) => state.itemShape)
  const sizePx = ITEM_SIZE_PX[itemSize]

  return (
    <div
      className={`overflow-hidden border border-black bg-black/40 shadow-xl ${SHAPE_CLASS[itemShape]}`}
      style={{ width: sizePx, height: sizePx }}
    >
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt={item.label ?? 'Tier item'}
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center p-1"
          style={{ backgroundColor: bgColor, color: getTextColor(bgColor) }}
        >
          <span className="text-xs font-semibold break-words text-center [overflow-wrap:anywhere]">
            {item.label}
          </span>
        </div>
      )}
    </div>
  )
})
