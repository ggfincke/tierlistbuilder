// src/components/board/TierItem.tsx
// sortable item tile — displays image or text, handles drag & delete

import { memo, useCallback, useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, PenLine, X } from 'lucide-react'

import { useKeyboardDrag } from '../../hooks/useKeyboardDrag'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useTierListStore } from '../../store/useTierListStore'
import {
  ITEM_SIZE_PX,
  SHAPE_CLASS,
  UNRANKED_CONTAINER_ID,
} from '../../utils/constants'
import { ItemContent } from './ItemContent'
import { ItemEditPopover } from './ItemEditPopover'

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
    const boardLocked = useSettingsStore((state) => state.boardLocked)

    const sizePx = ITEM_SIZE_PX[itemSize]

    const { isKeyboardFocused, isKeyboardDragging, onKeyDown, onFocus } =
      useKeyboardDrag(itemId)

    const [showEditPopover, setShowEditPopover] = useState(false)
    const [popoverAnchorRect, setPopoverAnchorRect] = useState<DOMRect | null>(
      null
    )
    const itemRef = useRef<HTMLDivElement | null>(null)

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
      disabled: boardLocked,
      data: {
        type: 'item',
        containerId,
      },
    })

    const setRefs = useCallback(
      (node: HTMLDivElement | null) =>
      {
        setNodeRef(node)
        itemRef.current = node
      },
      [setNodeRef]
    )

    const openEditPopover = useCallback((e: React.MouseEvent) =>
    {
      e.stopPropagation()
      if (itemRef.current)
      {
        setPopoverAnchorRect(itemRef.current.getBoundingClientRect())
        setShowEditPopover(true)
      }
    }, [])

    // item may have been deleted while dragging — render nothing
    if (!item)
    {
      return null
    }

    const hasImage = !!item.imageUrl

    return (
      <>
        <div
          ref={setRefs}
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
          className={`focus-custom group relative touch-none overflow-hidden outline-none ${SHAPE_CLASS[itemShape]} ${
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

          {/* drag handle indicator — hover-reveal on desktop, persistent on mobile */}
          {!boardLocked && (
            <span className="pointer-events-none absolute top-0.5 left-0.5 flex h-5 w-5 items-center justify-center text-white/40 opacity-0 transition-opacity group-hover:opacity-60 max-sm:opacity-30">
              <GripVertical className="h-3 w-3" />
            </span>
          )}

          {/* alt text edit — bottom-left corner, image items only */}
          {!boardLocked && hasImage && (
            <button
              type="button"
              aria-label="Edit alt text"
              className="absolute bottom-0.5 left-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100"
              onClick={openEditPopover}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <PenLine className="h-3 w-3" />
            </button>
          )}

          {/* hover-reveal delete button — only in the unranked pool, hidden when locked */}
          {canDelete && !boardLocked && (
            <button
              type="button"
              aria-label="Remove item"
              className="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100 max-sm:h-7 max-sm:w-7 max-sm:top-0 max-sm:right-0"
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

        {showEditPopover && popoverAnchorRect && (
          <ItemEditPopover
            itemId={itemId}
            anchorRect={popoverAnchorRect}
            onClose={() => setShowEditPopover(false)}
          />
        )}
      </>
    )
  }
)
