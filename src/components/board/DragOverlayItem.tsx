// src/components/board/DragOverlayItem.tsx
// ghost item rendered in the dnd-kit DragOverlay while dragging
import type { TierItem as TierItemType } from '../../types'
import { getTextColor } from '../../utils/color'

interface DragOverlayItemProps {
  // the item being dragged
  item: TierItemType
}

export const DragOverlayItem = ({ item }: DragOverlayItemProps) => {
  const bgColor = item.backgroundColor ?? '#444'

  return (
    <div className="h-[104px] w-[104px] overflow-hidden border border-black bg-black/40 shadow-xl">
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
}
