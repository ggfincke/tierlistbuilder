// src/hooks/useKeyboardDrag.ts
// keyboard browse & drag controller for tier list items

import { useCallback } from 'react'

import { useTierListStore } from '../store/useTierListStore'
import {
  findContainer,
  getEffectiveContainerSnapshot,
  getItemsInContainer,
  moveItemToIndexInSnapshot,
} from '../utils/dragSnapshot'
import {
  resolveColumnAwareCrossTierIndex,
  resolveIntraContainerRowMove,
} from '../utils/dragDomCapture'
import {
  resolveNextKeyboardDragPreview,
  resolveNextKeyboardFocusItem,
} from '../utils/dragKeyboard'
import type { KeyboardDragDirection } from '../utils/dragKeyboard'

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

// cancel the previous focus-restore RAF to avoid queueing stale focus calls
// from rapid arrow key presses
let pendingFocusFrame = 0

const scheduleFocusRestore = (itemId: string) =>
{
  cancelAnimationFrame(pendingFocusFrame)
  pendingFocusFrame = requestAnimationFrame(() => focusItemById(itemId))
}

// keyboard browse & drag hook — returns reactive state & event handlers
export const useKeyboardDrag = (itemId: string) =>
{
  const isKeyboardFocused = useTierListStore(
    (state) =>
      state.keyboardMode !== 'idle' && state.keyboardFocusItemId === itemId
  )
  const isKeyboardDragging = useTierListStore(
    (state) =>
      state.keyboardMode === 'dragging' && state.activeItemId === itemId
  )

  const handleSpaceKey = useCallback(() =>
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

    if (
      state.keyboardMode === 'dragging' &&
      state.activeItemId &&
      state.dragPreview
    )
    {
      const droppedItemId = state.activeItemId
      state.commitDragPreview()
      state.setActiveItemId(null)
      state.setKeyboardFocusItemId(droppedItemId)
      state.setKeyboardMode('browse')
      scheduleFocusRestore(droppedItemId)
    }
  }, [itemId])

  const handleArrowKey = useCallback(
    (direction: KeyboardDragDirection) =>
    {
      const state = useTierListStore.getState()
      const snapshot = getEffectiveContainerSnapshot(state)

      if (state.keyboardMode === 'browse')
      {
        const focusedItemId = state.keyboardFocusItemId ?? itemId

        // if the focused item no longer exists (e.g. deleted via undo),
        // fall back to the current element's item & re-anchor focus
        const focusContainerId = findContainer(snapshot, focusedItemId)

        if (!focusContainerId)
        {
          state.setKeyboardFocusItemId(itemId)
          scheduleFocusRestore(itemId)
          return
        }

        // check for intra-row navigation within a multi-row container
        if (direction === 'ArrowUp' || direction === 'ArrowDown')
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
        const nextFocusContainer = findContainer(snapshot, nextFocusItemId)

        if (
          (direction === 'ArrowUp' || direction === 'ArrowDown') &&
          nextFocusContainer &&
          focusContainerId !== nextFocusContainer
        )
        {
          const targetItems = getItemsInContainer(snapshot, nextFocusContainer)
          const columnTarget = resolveColumnAwareCrossTierIndex(
            focusContainerId,
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

      // if the dragged item no longer exists, discard the preview & exit
      if (!activeContainerId)
      {
        state.discardDragPreview()
        state.setActiveItemId(null)
        state.clearKeyboardMode()
        return
      }

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
        const targetItems = getItemsInContainer(
          snapshot,
          nextTarget.containerId
        )
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
    },
    [itemId]
  )

  const handleEscapeKey = useCallback(() =>
  {
    const state = useTierListStore.getState()
    const focusedItemId =
      state.activeItemId ?? state.keyboardFocusItemId ?? itemId

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
  }, [itemId])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) =>
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
    },
    [handleSpaceKey, handleEscapeKey, handleArrowKey]
  )

  const onFocus = useCallback(() =>
  {
    const state = useTierListStore.getState()
    if (state.keyboardMode !== 'idle')
    {
      state.setKeyboardFocusItemId(itemId)
    }
  }, [itemId])

  return { isKeyboardFocused, isKeyboardDragging, onKeyDown, onFocus }
}
