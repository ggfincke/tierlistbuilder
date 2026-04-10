// src/components/board/TierItem.tsx
// sortable item tile — displays image or text, handles drag & delete

import { memo, useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
import { ItemOverlayButton } from '../ui/ItemOverlayButton'

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
    const isSelected = useTierListStore((state) =>
      state.selectedItemIds.includes(itemId)
    )
    const toggleItemSelected = useTierListStore(
      (state) => state.toggleItemSelected
    )
    const canDelete = containerId === UNRANKED_CONTAINER_ID

    const itemSize = useSettingsStore((state) => state.itemSize)
    const itemShape = useSettingsStore((state) => state.itemShape)
    const showLabels = useSettingsStore((state) => state.showLabels)
    const boardLocked = useSettingsStore((state) => state.boardLocked)
    const showAltTextButton = useSettingsStore(
      (state) => state.showAltTextButton
    )

    const sizePx = ITEM_SIZE_PX[itemSize]

    const { isKeyboardFocused, isKeyboardDragging, onKeyDown, onFocus } =
      useKeyboardDrag(itemId)

    const [showEditPopover, setShowEditPopover] = useState(false)
    const itemRef = useRef<HTMLDivElement | null>(null)
    const editButtonRef = useRef<HTMLButtonElement | null>(null)

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

    // track pointer position to distinguish clicks from drags; use capture
    // phase so it doesn't shadow dnd-kit's bubble-phase onPointerDown
    // activator wired via {...listeners}
    const pointerStartRef = useRef<{ x: number; y: number } | null>(null)

    const handlePointerDownCapture = useCallback((e: React.PointerEvent) =>
    {
      pointerStartRef.current = { x: e.clientX, y: e.clientY }
    }, [])

    const handleClick = useCallback(
      (e: React.MouseEvent) =>
      {
        if (boardLocked) return

        // ignore if the pointer moved (was a drag, not a click)
        if (pointerStartRef.current)
        {
          const dx = Math.abs(e.clientX - pointerStartRef.current.x)
          const dy = Math.abs(e.clientY - pointerStartRef.current.y)
          if (dx > 4 || dy > 4) return
        }

        toggleItemSelected(itemId, e.shiftKey)
      },
      [boardLocked, itemId, toggleItemSelected]
    )

    const openEditPopover = useCallback((e: React.MouseEvent) =>
    {
      e.stopPropagation()
      setShowEditPopover(true)
    }, [])
    const closeEditPopover = useCallback(() =>
    {
      setShowEditPopover(false)
      requestAnimationFrame(() => editButtonRef.current?.focus())
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
            isSelected
              ? 'z-20 ring-2 ring-[var(--t-accent)] ring-offset-2 ring-offset-[var(--t-bg-surface)]'
              : isKeyboardDragging
                ? 'z-20 ring-2 ring-[var(--t-accent)] ring-offset-2 ring-offset-[var(--t-bg-surface)]'
                : isKeyboardFocused
                  ? 'z-10 ring-2 ring-[var(--t-accent-hover)] ring-offset-2 ring-offset-[var(--t-bg-surface)]'
                  : ''
          }`}
          data-keyboard-dragging={isKeyboardDragging ? 'true' : 'false'}
          data-keyboard-focused={isKeyboardFocused ? 'true' : 'false'}
          data-selected={isSelected ? 'true' : undefined}
          {...attributes}
          {...listeners}
          tabIndex={0}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          onPointerDownCapture={handlePointerDownCapture}
          onClick={handleClick}
        >
          <ItemContent item={item} showLabel={showLabels && !!item.label} />

          {/* drag handle indicator — hover-reveal on desktop, persistent on mobile */}
          {!boardLocked && (
            <span className="pointer-events-none absolute top-0.5 left-0.5 flex h-5 w-5 items-center justify-center text-white/40 opacity-0 transition-opacity group-hover:opacity-60 group-focus-within:opacity-60 max-sm:opacity-30">
              <GripVertical className="h-3 w-3" />
            </span>
          )}

          {/* alt text edit — bottom-left corner, image items only */}
          {!boardLocked && hasImage && showAltTextButton && (
            <ItemOverlayButton
              ref={editButtonRef}
              aria-label="Edit alt text"
              className="absolute bottom-0.5 left-0.5"
              onClick={openEditPopover}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <PenLine className="h-3 w-3" />
            </ItemOverlayButton>
          )}

          {/* hover-reveal delete button — only in the unranked pool, hidden when locked */}
          {canDelete && !boardLocked && (
            <ItemOverlayButton
              aria-label="Remove item"
              className="absolute top-0.5 right-0.5 max-sm:right-0 max-sm:top-0 max-sm:h-7 max-sm:w-7"
              onClick={(e) =>
              {
                e.stopPropagation()
                onRequestDelete?.(itemId)
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <X className="h-3 w-3" />
            </ItemOverlayButton>
          )}
        </div>

        {showEditPopover &&
          createPortal(
            <ItemEditPopover
              itemId={itemId}
              anchorRef={itemRef}
              triggerRef={editButtonRef}
              onClose={closeEditPopover}
            />,
            document.body
          )}
      </>
    )
  }
)
