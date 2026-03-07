// src/components/board/DragOverlayItem.tsx
// ghost item rendered in the dnd-kit DragOverlay while dragging
import type { TierItem as TierItemType } from '../../types'

interface DragOverlayItemProps {
  // the item being dragged
  item: TierItemType
}

export const DragOverlayItem = ({ item }: DragOverlayItemProps) => {
  return (
    <div className="h-20 w-20 overflow-hidden border border-black bg-black/40 shadow-xl sm:h-24 sm:w-24">
      <img
        src={item.imageUrl}
        alt={item.label ?? 'Tier item'}
        className="h-full w-full object-cover"
        draggable={false}
      />
    </div>
  )
}
