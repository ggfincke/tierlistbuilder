// src/components/board/TierItem.tsx
// sortable item tile — displays image, handles drag & delete
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { useTierListStore } from '../../store/useTierListStore'

interface TierItemProps {
  // ID of the item to render
  itemId: string
  // ID of the container (tier or unranked pool) this item lives in
  containerId: string
}

export const TierItem = ({ itemId, containerId }: TierItemProps) => {
  const item = useTierListStore((state) => state.items[itemId])

  // register w/ dnd-kit sortable — data payload identifies this as an item
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: itemId,
      data: {
        type: 'item',
        containerId,
      },
    })

  // item may have been deleted while dragging — render nothing
  if (!item) {
    return null
  }

  return (
    <div
      ref={setNodeRef}
      data-testid={`tier-item-${itemId}`}
      data-item-id={itemId}
      data-item-label={item.label ?? ''}
      data-container-id={containerId}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        // fade the source tile while its ghost is shown in the overlay
        opacity: isDragging ? 0.4 : 1,
      }}
      className="h-20 w-20 touch-none overflow-hidden border border-[#111] sm:h-24 sm:w-24"
      {...attributes}
      {...listeners}
    >
      <img
        src={item.imageUrl}
        alt={item.label ?? 'Tier item'}
        className="h-full w-full object-cover"
        draggable={false}
      />

    </div>
  )
}
