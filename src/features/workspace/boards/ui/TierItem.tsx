// src/features/workspace/boards/ui/TierItem.tsx
// sortable item tile — displays image or text, handles drag & delete

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useShallow } from 'zustand/react/shallow'
import { Check, GripVertical, X } from 'lucide-react'

import { useKeyboardDrag } from '~/features/workspace/boards/interaction/useKeyboardDrag'
import { useItemPreviewStore } from '~/features/workspace/preview/model/useItemPreviewStore'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import {
  selectHasKeyboardSelection,
  useActiveBoardStore,
} from '~/features/workspace/boards/model/useActiveBoardStore'
import { UNRANKED_CONTAINER_ID } from '~/features/workspace/boards/lib/dndIds'
import { getEffectiveImageFit } from '~/shared/board-ui/aspectRatio'
import { tierItemTestId } from '~/shared/board-ui/boardTestIds'
import { SHAPE_CLASS } from '~/shared/board-ui/constants'
import { ItemContent } from '~/shared/board-ui/ItemContent'
import { resolveLabelDisplay } from '~/shared/board-ui/labelDisplay'
import { hasAnyImageRef } from '~/shared/lib/imageRefs'
import { useImageEditorStore } from '~/features/workspace/imageEditor/model/useImageEditorStore'
import { preloadImageEditorModal } from '~/features/workspace/imageEditor/ui/loadImageEditorModal'
import { ItemContextMenu } from './ItemContextMenu'
import { resolveItemVisualState } from './itemVisualState'
import { ItemOverlayButton } from '~/shared/board-ui/ItemOverlayButton'
import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import type {
  BoardLabelSettings,
  ImageFit,
} from '@tierlistbuilder/contracts/workspace/board'

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
  boardLabels: BoardLabelSettings | undefined
}

export const TierItem = memo(
  ({
    itemId,
    containerId,
    onRequestDelete,
    slotWidth,
    slotHeight,
    boardDefaultFit,
    boardLabels,
  }: TierItemProps) =>
  {
    const { item, isSelected } = useActiveBoardStore(
      useShallow((state) => ({
        item: state.items[itemId],
        isSelected: state.selection.set.has(itemId),
      }))
    )
    const canDelete = containerId === UNRANKED_CONTAINER_ID

    const {
      itemShape,
      showLabels,
      defaultLabelPlacementMode,
      defaultLabelFontSizePx,
      boardLocked,
    } = usePreferencesStore(
      useShallow((state) => ({
        itemShape: state.itemShape,
        showLabels: state.showLabels,
        defaultLabelPlacementMode: state.defaultLabelPlacementMode,
        defaultLabelFontSizePx: state.defaultLabelFontSizePx,
        boardLocked: state.boardLocked,
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

    const [contextMenuPos, setContextMenuPos] = useState<{
      x: number
      y: number
    } | null>(null)
    const itemRef = useRef<HTMLDivElement | null>(null)

    const openItemEditor = useCallback(() =>
    {
      useImageEditorStore.getState().open({ itemId, mode: 'single' })
    }, [itemId])

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
    // touch long-press -> preview. iOS Safari swallows contextmenu on plain
    // divs (system text-select menu wins) so the right-click path doesn't
    // cover touch on its own
    const longPressTimerRef = useRef<number | null>(null)
    const longPressFiredRef = useRef(false)

    const clearLongPress = useCallback(() =>
    {
      if (longPressTimerRef.current !== null)
      {
        window.clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
    }, [])

    useEffect(() =>
    {
      if (isDragging) clearLongPress()
    }, [clearLongPress, isDragging])

    useEffect(() => clearLongPress, [clearLongPress])

    const handlePointerDownCapture = useCallback(
      (e: React.PointerEvent) =>
      {
        pointerStartRef.current = { x: e.clientX, y: e.clientY }
        pointerFocusRef.current = true
        longPressFiredRef.current = false
        clearLongPress()
        if (e.pointerType !== 'touch') return
        longPressTimerRef.current = window.setTimeout(() =>
        {
          longPressTimerRef.current = null
          const current = useActiveBoardStore.getState().items[itemId]
          if (!current || !hasAnyImageRef(current)) return
          longPressFiredRef.current = true
          useItemPreviewStore.getState().open(itemId)
        }, 550)
      },
      [clearLongPress, itemId]
    )

    const handlePointerMoveCapture = useCallback(
      (e: React.PointerEvent) =>
      {
        if (longPressTimerRef.current === null) return
        if (!pointerStartRef.current) return
        const dx = Math.abs(e.clientX - pointerStartRef.current.x)
        const dy = Math.abs(e.clientY - pointerStartRef.current.y)
        if (dx > 8 || dy > 8) clearLongPress()
      },
      [clearLongPress]
    )

    const handlePointerEndCapture = useCallback(() =>
    {
      clearLongPress()
    }, [clearLongPress])

    const handleClick = useCallback(
      (e: React.MouseEvent) =>
      {
        if (boardLocked) return

        // second-of-double click: open the editor directly (don't rely on
        // dblclick — it can be skipped when the wrapper re-renders between
        // clicks) & skip toggling selection a second time
        if (e.detail > 1)
        {
          pointerStartRef.current = null
          pointerFocusRef.current = false
          e.preventDefault()
          e.stopPropagation()
          openItemEditor()
          return
        }

        // long-press already opened the preview; swallow the trailing click so
        // it doesn't toggle selection on top
        if (longPressFiredRef.current)
        {
          longPressFiredRef.current = false
          pointerStartRef.current = null
          pointerFocusRef.current = false
          return
        }

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

        const state = useActiveBoardStore.getState()
        const selectedNow = state.selection.set.has(itemId)
        const hasKeyboardSelection = selectHasKeyboardSelection(state)

        if (!e.shiftKey && !modKey && hasKeyboardSelection && selectedNow)
        {
          state.toggleItemSelected(itemId, false, true)
        }
        else
        {
          state.toggleItemSelected(itemId, e.shiftKey, modKey)
        }

        state.setKeyboardFocusItemId(itemId)
        state.setKeyboardMode('browse')
      },
      [boardLocked, item, itemId, openItemEditor]
    )

    const handleDoubleClick = useCallback(
      (e: React.MouseEvent) =>
      {
        if (!item) return
        e.preventDefault()
        e.stopPropagation()
        openItemEditor()
      },
      [item, openItemEditor]
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
        const state = useActiveBoardStore.getState()
        if (!state.selection.set.has(itemId))
        {
          state.toggleItemSelected(itemId, false, false)
        }
        state.setKeyboardFocusItemId(itemId)
        state.setKeyboardMode('browse')
        setContextMenuPos({ x: e.clientX, y: e.clientY })
      },
      [boardLocked, item, itemId]
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

    // `E` & `F2` open the item editor on a focused tile — drag stays on Space
    // so item activation by keyboard doesn't change shape from Phase 4
    const handleItemKeyDown = useCallback(
      (event: ReactKeyboardEvent) =>
      {
        if (
          !boardLocked &&
          (event.key === 'e' || event.key === 'E' || event.key === 'F2')
        )
        {
          event.preventDefault()
          openItemEditor()
          return
        }
        onKeyDown(event)
      },
      [boardLocked, onKeyDown, openItemEditor]
    )

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
          onKeyDown={handleItemKeyDown}
          onPointerDownCapture={handlePointerDownCapture}
          onPointerMoveCapture={handlePointerMoveCapture}
          onPointerUpCapture={handlePointerEndCapture}
          onPointerCancelCapture={handlePointerEndCapture}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          onPointerEnter={preloadImageEditorModal}
        >
          <ItemContent
            item={item}
            label={resolveLabelDisplay({
              itemLabel: item.label,
              itemOptions: item.labelOptions,
              boardSettings: boardLabels,
              globalLabelDefaults: {
                showLabels,
                placementMode: defaultLabelPlacementMode,
                fontSizePx: defaultLabelFontSizePx,
              },
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
