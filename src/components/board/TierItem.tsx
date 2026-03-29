// src/components/board/TierItem.tsx
// sortable item tile — displays image or text, handles drag & delete

import { memo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { X } from 'lucide-react'

import { useKeyboardDrag } from '../../hooks/useKeyboardDrag'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useTierListStore } from '../../store/useTierListStore'
import {
  ITEM_SIZE_PX,
  SHAPE_CLASS,
  UNRANKED_CONTAINER_ID,
} from '../../utils/constants'
import { ItemContent } from './ItemContent'

interface TierItemProps
{
  // ID of the item to render
  itemId: string
  // ID of the container (tier or unranked pool) this item lives in
  containerId: string
  // called when user requests deletion (only used in the unranked pool)
  onRequestDelete?: (itemId: string) => void
}

export const TierItem = memo(
  ({ itemId, containerId, onRequestDelete }: TierItemProps) =>
  {
    const item = useTierListStore((state) => state.items[itemId])
    const canDelete = containerId === UNRANKED_CONTAINER_ID

    const itemSize = useSettingsStore((state) => state.itemSize)
    const itemShape = useSettingsStore((state) => state.itemShape)
    const showLabels = useSettingsStore((state) => state.showLabels)

    const sizePx = ITEM_SIZE_PX[itemSize]

    const { isKeyboardFocused, isKeyboardDragging, onKeyDown, onFocus } =
      useKeyboardDrag(itemId)

    // register w/ dnd-kit sortable — data payload identifies this as an item
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({
      id: itemId,
      data: {
        type: 'item',
        containerId,
      },
    })

    // item may have been deleted while dragging — render nothing
    if (!item)
    {
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
          width: sizePx,
          height: sizePx,
          transform: CSS.Transform.toString(transform),
          transition,
          // fade the source tile while its ghost is shown in the overlay
          opacity: isDragging ? 0.4 : isKeyboardDragging ? 0.75 : 1,
        }}
        className={`group relative touch-none overflow-hidden outline-none ${SHAPE_CLASS[itemShape]} ${
          isKeyboardDragging
            ? 'z-20 ring-2 ring-[var(--t-accent)] ring-offset-2 ring-offset-[var(--t-bg-surface)]'
            : isKeyboardFocused
              ? 'z-10 ring-2 ring-[var(--t-accent-hover)] ring-offset-2 ring-offset-[var(--t-bg-surface)]'
              : ''
        }`}
        data-keyboard-dragging={isKeyboardDragging ? 'true' : 'false'}
        data-keyboard-focused={isKeyboardFocused ? 'true' : 'false'}
        {...attributes}
        {...listeners}
        tabIndex={0}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
      >
        <ItemContent item={item} showLabel={showLabels && !!item.label} />

        {/* hover-reveal delete button — only in the unranked pool */}
        {canDelete && (
          <button
            type="button"
            aria-label="Remove item"
            className="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(e) =>
            {
              e.stopPropagation()
              onRequestDelete?.(itemId)
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    )
  }
)
