// src/features/workspace/boards/ui/TierItem.tsx
// sortable item tile — displays image or text, handles drag & delete

import { memo, useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useShallow } from 'zustand/react/shallow'
import { Check, GripVertical, PenLine, X } from 'lucide-react'

import { useKeyboardDrag } from '~/features/workspace/boards/interaction/useKeyboardDrag'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import {
  selectHasKeyboardSelection,
  useActiveBoardStore,
} from '~/features/workspace/boards/model/useActiveBoardStore'
import { UNRANKED_CONTAINER_ID } from '~/features/workspace/boards/lib/dndIds'
import { getEffectiveImageFit } from '~/features/workspace/boards/lib/aspectRatio'
import { tierItemTestId } from '~/shared/board-ui/boardTestIds'
import { SHAPE_CLASS } from '~/shared/board-ui/constants'
import { ItemContent } from '~/shared/board-ui/ItemContent'
import { resolveLabelDisplay } from '~/shared/board-ui/labelDisplay'
import { ItemContextMenu } from './ItemContextMenu'
import { ItemEditPopover } from './ItemEditPopover'
import { resolveItemVisualState } from './itemVisualState'
import { ItemOverlayButton } from '~/shared/board-ui/ItemOverlayButton'
import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import type { ImageFit } from '@tierlistbuilder/contracts/workspace/board'

interface TierItemProps
{
  itemId: ItemId
  containerId: string
  onRequestDelete?: (itemId: ItemId) => void
  // slot width in px — derived once by the parent from board aspect ratio
  slotWidth: number
  // slot height in px — derived once by the parent from board aspect ratio
  slotHeight: number
  // board-wide image fit default — per-item override still wins
  boardDefaultFit: ImageFit | undefined
}

export const TierItem = memo(
  ({
    itemId,
    containerId,
    onRequestDelete,
    slotWidth,
    slotHeight,
    boardDefaultFit,
  }: TierItemProps) =>
  {
    const {
      item,
      isSelected,
      hasKeyboardSelection,
      toggleItemSelected,
      setKeyboardFocusItemId,
      setKeyboardMode,
      boardLabels,
    } = useActiveBoardStore(
      useShallow((state) => ({
        item: state.items[itemId],
        isSelected: state.selection.set.has(itemId),
        hasKeyboardSelection: selectHasKeyboardSelection(state),
        toggleItemSelected: state.toggleItemSelected,
        setKeyboardFocusItemId: state.setKeyboardFocusItemId,
        setKeyboardMode: state.setKeyboardMode,
        boardLabels: state.labels,
      }))
    )
    const canDelete = containerId === UNRANKED_CONTAINER_ID

    const { itemShape, showLabels, boardLocked, showAltTextButton } =
      useSettingsStore(
        useShallow((state) => ({
          itemShape: state.itemShape,
          showLabels: state.showLabels,
          boardLocked: state.boardLocked,
          showAltTextButton: state.showAltTextButton,
        }))
      )

    const effectiveFit = item
      ? getEffectiveImageFit(item, boardDefaultFit)
      : 'cover'

    const {
      isKeyboardFocused,
      isKeyboardDragging,
      isKeyboardTabStop,
      onKeyDown,
      onFocus,
    } = useKeyboardDrag(itemId)

    const [showEditPopover, setShowEditPopover] = useState(false)
    const [contextMenuPos, setContextMenuPos] = useState<{
      x: number
      y: number
    } | null>(null)
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
    const pointerFocusRef = useRef(false)

    const handlePointerDownCapture = useCallback((e: React.PointerEvent) =>
    {
      pointerStartRef.current = { x: e.clientX, y: e.clientY }
      pointerFocusRef.current = true
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
          pointerStartRef.current = null
          if (dx > 4 || dy > 4) return
        }

        pointerFocusRef.current = false

        const modKey = e.ctrlKey || e.metaKey

        if (!e.shiftKey && !modKey && hasKeyboardSelection && isSelected)
        {
          toggleItemSelected(itemId, false, true)
        }
        else
        {
          toggleItemSelected(itemId, e.shiftKey, modKey)
        }

        setKeyboardFocusItemId(itemId)
        setKeyboardMode('browse')
      },
      [
        boardLocked,
        hasKeyboardSelection,
        itemId,
        isSelected,
        setKeyboardFocusItemId,
        setKeyboardMode,
        toggleItemSelected,
      ]
    )

    const handleContextMenu = useCallback(
      (e: React.MouseEvent) =>
      {
        if (boardLocked) return
        if (!item) return
        e.preventDefault()
        // pin the right-clicked item as the sole selection so bulk move/remove
        // act on what the user clicked; if it's already in a multi-selection,
        // leave the selection alone & operate on the whole group
        if (!isSelected) toggleItemSelected(itemId, false, false)
        setKeyboardFocusItemId(itemId)
        setKeyboardMode('browse')
        setContextMenuPos({ x: e.clientX, y: e.clientY })
      },
      [
        boardLocked,
        item,
        isSelected,
        itemId,
        setKeyboardFocusItemId,
        setKeyboardMode,
        toggleItemSelected,
      ]
    )

    const handleItemFocus = useCallback(() =>
    {
      if (pointerFocusRef.current)
      {
        pointerFocusRef.current = false
        return
      }

      onFocus()
    }, [onFocus])

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

    const { stateClass, opacity } = resolveItemVisualState({
      isSelected,
      isKeyboardFocused,
      isKeyboardDragging,
      isDragging,
    })

    // item may have been deleted while dragging — render nothing
    if (!item)
    {
      return null
    }

    const hasImage = !!item.imageRef

    return (
      <>
        <div
          ref={setRefs}
          data-testid={tierItemTestId(itemId)}
          data-item-id={itemId}
          data-item-label={item.label ?? ''}
          data-container-id={containerId}
          style={{
            width: slotWidth,
            height: slotHeight,
            transform: CSS.Transform.toString(transform),
            transition,
            opacity,
          }}
          className={`focus-custom group relative touch-none overflow-hidden outline-none ${SHAPE_CLASS[itemShape]} ${stateClass}`}
          data-keyboard-dragging={isKeyboardDragging ? 'true' : 'false'}
          data-keyboard-focused={isKeyboardFocused ? 'true' : 'false'}
          data-selected={isSelected ? 'true' : undefined}
          {...attributes}
          {...listeners}
          tabIndex={isKeyboardTabStop ? 0 : -1}
          onFocus={handleItemFocus}
          onKeyDown={onKeyDown}
          onPointerDownCapture={handlePointerDownCapture}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
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
            frameAspectRatio={slotWidth / slotHeight}
          />

          {/* selection check badge */}
          {isSelected && (
            <span className="pointer-events-none absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--t-accent)] shadow-sm">
              <Check
                className="h-3 w-3 text-[var(--t-accent-foreground)]"
                strokeWidth={3}
              />
            </span>
          )}

          {/* drag handle indicator — hover-reveal on desktop, persistent on mobile */}
          {!boardLocked && (
            <span className="pointer-events-none absolute top-0.5 left-0.5 flex h-5 w-5 items-center justify-center text-[rgb(var(--t-overlay)/0.45)] opacity-0 transition-opacity group-hover:opacity-60 group-focus-within:opacity-60 max-sm:opacity-30">
              <GripVertical className="h-3 w-3" />
            </span>
          )}

          {/* alt text edit — bottom-left corner, image items only */}
          {!boardLocked && hasImage && showAltTextButton && (
            <ItemOverlayButton
              ref={editButtonRef}
              aria-label="Edit alt text"
              className="absolute bottom-0.5 left-0.5"
              tabIndex={isKeyboardFocused ? 0 : -1}
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
              tabIndex={isKeyboardFocused ? 0 : -1}
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

        {contextMenuPos &&
          createPortal(
            <ItemContextMenu
              itemId={itemId}
              position={contextMenuPos}
              onClose={() => setContextMenuPos(null)}
            />,
            document.body
          )}
      </>
    )
  }
)
