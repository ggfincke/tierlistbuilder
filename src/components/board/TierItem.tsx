// src/components/board/TierItem.tsx
// sortable item tile — displays image or text, handles drag & delete

import { memo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { X } from 'lucide-react'

import { useSettingsStore } from '../../store/useSettingsStore'
import { useTierListStore } from '../../store/useTierListStore'
import { getTextColor } from '../../utils/color'
import {
  ITEM_SIZE_PX,
  SHAPE_CLASS,
  UNRANKED_CONTAINER_ID,
} from '../../utils/constants'
import {
  findContainer,
  getEffectiveContainerSnapshot,
  getItemsInContainer,
  moveItemToIndexInSnapshot,
  resolveColumnAwareCrossTierIndex,
  resolveIntraContainerRowMove,
  resolveNextKeyboardDragPreview,
  resolveNextKeyboardFocusItem,
} from '../../utils/dragInsertion'
import type { KeyboardDragDirection } from '../../utils/dragInsertion'

const KEYBOARD_DIRECTIONS = new Set<KeyboardDragDirection>([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
])

const focusItemById = (itemId: string) =>
{
  if (typeof document === 'undefined')
  {
    return
  }

  const itemElement = document.querySelector<HTMLElement>(
    `[data-testid="tier-item-${itemId}"]`
  )

  if (itemElement)
  {
    itemElement.focus({ preventScroll: true })
    return
  }

  const boardElement = document.querySelector<HTMLElement>(
    '[data-testid="tier-list-board"]'
  )
  boardElement?.focus({ preventScroll: true })
}

const scheduleFocusRestore = (itemId: string) =>
{
  requestAnimationFrame(() => focusItemById(itemId))
}

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
    const isKeyboardFocused = useTierListStore(
      (state) =>
        state.keyboardMode !== 'idle' && state.keyboardFocusItemId === itemId
    )
    const isKeyboardDragging = useTierListStore(
      (state) =>
        state.keyboardMode === 'dragging' && state.activeItemId === itemId
    )

    const itemSize = useSettingsStore((state) => state.itemSize)
    const itemShape = useSettingsStore((state) => state.itemShape)
    const showLabels = useSettingsStore((state) => state.showLabels)

    const sizePx = ITEM_SIZE_PX[itemSize]

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

    const bgColor = item.backgroundColor ?? '#444'

    const handleSpaceKey = () =>
    {
      const state = useTierListStore.getState()
      const focusedItemId = state.keyboardFocusItemId ?? itemId

      if (state.keyboardMode === 'idle')
      {
        state.setKeyboardFocusItemId(itemId)
        state.setKeyboardMode('browse')
        return
      }

      if (state.keyboardMode === 'browse')
      {
        state.beginDragPreview()
        state.setActiveItemId(focusedItemId)
        state.setKeyboardFocusItemId(focusedItemId)
        state.setKeyboardMode('dragging')
        scheduleFocusRestore(focusedItemId)
        return
      }

      if (state.keyboardMode === 'dragging' && state.activeItemId)
      {
        const droppedItemId = state.activeItemId
        state.commitDragPreview()
        state.setActiveItemId(null)
        state.setKeyboardFocusItemId(droppedItemId)
        state.setKeyboardMode('browse')
        scheduleFocusRestore(droppedItemId)
      }
    }

    const handleArrowKey = (direction: KeyboardDragDirection) =>
    {
      const state = useTierListStore.getState()
      const snapshot = getEffectiveContainerSnapshot(state)

      if (state.keyboardMode === 'browse')
      {
        const focusedItemId = state.keyboardFocusItemId ?? itemId

        // check for intra-row navigation within a multi-row container
        if (direction === 'ArrowUp' || direction === 'ArrowDown')
        {
          const focusContainerId = findContainer(snapshot, focusedItemId)

          if (focusContainerId)
          {
            const containerItems = getItemsInContainer(snapshot, focusContainerId)
            const intraMove = resolveIntraContainerRowMove(
              focusContainerId,
              focusedItemId,
              direction,
              containerItems
            )

            if (intraMove)
            {
              state.setKeyboardFocusItemId(intraMove.targetItemId)
              scheduleFocusRestore(intraMove.targetItemId)
              return
            }
          }
        }

        const nextFocusItemId = resolveNextKeyboardFocusItem({
          snapshot,
          itemId: focusedItemId,
          direction,
        })

        if (!nextFocusItemId)
        {
          return
        }

        // column-aware focus when crossing tiers w/ ArrowUp/ArrowDown
        const focusContainerForCross = findContainer(snapshot, focusedItemId)
        const nextFocusContainer = findContainer(snapshot, nextFocusItemId)

        if (
          (direction === 'ArrowUp' || direction === 'ArrowDown') &&
          focusContainerForCross &&
          nextFocusContainer &&
          focusContainerForCross !== nextFocusContainer
        )
        {
          const targetItems = getItemsInContainer(snapshot, nextFocusContainer)
          const columnTarget = resolveColumnAwareCrossTierIndex(
            focusContainerForCross,
            focusedItemId,
            nextFocusContainer,
            targetItems,
            direction
          )

          if (columnTarget)
          {
            state.setKeyboardFocusItemId(columnTarget.targetItemId)
            scheduleFocusRestore(columnTarget.targetItemId)
            return
          }
        }

        state.setKeyboardFocusItemId(nextFocusItemId)
        scheduleFocusRestore(nextFocusItemId)
        return
      }

      if (state.keyboardMode !== 'dragging' || !state.activeItemId)
      {
        return
      }

      const activeKeyboardItemId = state.activeItemId
      const activeContainerId = findContainer(snapshot, activeKeyboardItemId)

      // check for intra-row movement within a multi-row container
      if (
        (direction === 'ArrowUp' || direction === 'ArrowDown') &&
        activeContainerId
      )
      {
        const containerItems = getItemsInContainer(snapshot, activeContainerId)
        const intraMove = resolveIntraContainerRowMove(
          activeContainerId,
          activeKeyboardItemId,
          direction,
          containerItems
        )

        if (intraMove)
        {
          const nextPreview = moveItemToIndexInSnapshot({
            snapshot,
            itemId: activeKeyboardItemId,
            toContainerId: activeContainerId,
            toIndex: intraMove.targetIndex,
          })
          state.updateDragPreview(nextPreview)
          state.setKeyboardFocusItemId(activeKeyboardItemId)
          scheduleFocusRestore(activeKeyboardItemId)
          return
        }
      }

      let nextTarget = resolveNextKeyboardDragPreview({
        snapshot,
        itemId: activeKeyboardItemId,
        direction,
      })

      if (!nextTarget)
      {
        return
      }

      // column-aware placement when crossing into a multi-row target
      if (
        (direction === 'ArrowUp' || direction === 'ArrowDown') &&
        activeContainerId &&
        nextTarget.containerId !== activeContainerId
      )
      {
        const targetItems = getItemsInContainer(snapshot, nextTarget.containerId)
        const columnTarget = resolveColumnAwareCrossTierIndex(
          activeContainerId,
          activeKeyboardItemId,
          nextTarget.containerId,
          targetItems,
          direction
        )

        if (columnTarget)
        {
          nextTarget = {
            containerId: nextTarget.containerId,
            nextPreview: moveItemToIndexInSnapshot({
              snapshot,
              itemId: activeKeyboardItemId,
              toContainerId: nextTarget.containerId,
              toIndex: columnTarget.targetIndex,
            }),
          }
        }
      }

      state.updateDragPreview(nextTarget.nextPreview)
      state.setKeyboardFocusItemId(activeKeyboardItemId)
      scheduleFocusRestore(activeKeyboardItemId)
    }

    const handleEscapeKey = () =>
    {
      const state = useTierListStore.getState()
      const focusedItemId = state.activeItemId ?? state.keyboardFocusItemId ?? itemId

      if (state.keyboardMode === 'dragging')
      {
        state.discardDragPreview()
        state.setActiveItemId(null)
      }

      if (state.keyboardMode === 'idle')
      {
        return
      }

      state.clearKeyboardMode()
      scheduleFocusRestore(focusedItemId)
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
        onFocus={() =>
        {
          const state = useTierListStore.getState()
          if (state.keyboardMode !== 'idle')
          {
            state.setKeyboardFocusItemId(itemId)
          }
        }}
        onKeyDown={(event) =>
        {
          if (event.code === 'Space')
          {
            event.preventDefault()
            handleSpaceKey()
            return
          }

          if (event.key === 'Escape')
          {
            event.preventDefault()
            handleEscapeKey()
            return
          }

          if (!KEYBOARD_DIRECTIONS.has(event.key as KeyboardDragDirection))
          {
            return
          }

          if (useTierListStore.getState().keyboardMode === 'idle')
          {
            return
          }

          event.preventDefault()
          handleArrowKey(event.key as KeyboardDragDirection)
        }}
      >
        {item.imageUrl ? (
          <>
            <img
              src={item.imageUrl}
              alt={item.label ?? 'Tier item'}
              className="h-full w-full object-cover"
              draggable={false}
            />
            {/* label overlay for image items — shown when showLabels is on */}
            {showLabels && item.label && (
              <div className="absolute right-0 bottom-0 left-0 bg-black/60 px-1 py-0.5">
                <span className="block truncate text-center text-[10px] text-white">
                  {item.label}
                </span>
              </div>
            )}
          </>
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
