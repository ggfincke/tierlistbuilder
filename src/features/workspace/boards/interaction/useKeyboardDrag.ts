// src/features/workspace/boards/interaction/useKeyboardDrag.ts
// keyboard browse & drag controller for tier list items

import { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import {
  selectKeyboardTabStopItemId,
  useActiveBoardStore,
} from '~/features/workspace/boards/model/useActiveBoardStore'
import {
  KEYBOARD_DIRECTIONS,
  handleKeyboardArrowKey,
  handleKeyboardEscapeKey,
  handleKeyboardItemFocus,
  handleKeyboardSpaceKey,
} from './keyboardDragController'
import type { KeyboardDragDirection } from '~/features/workspace/boards/dnd/dragKeyboard'
import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'

// expose the shared selector for components that just need the tab-stop id
export const useKeyboardTabStopItemId = (): ItemId | null =>
  useActiveBoardStore(selectKeyboardTabStopItemId)

// keyboard browse & drag hook — returns reactive state & event handlers
export const useKeyboardDrag = (itemId: ItemId) =>
{
  // single useShallow keeps per-item listener count at 1 instead of 3;
  // on a 100-item board that's 200 fewer zustand subscribers per render cycle
  const { isKeyboardFocused, isKeyboardDragging, isKeyboardTabStop } =
    useActiveBoardStore(
      useShallow((state) => ({
        isKeyboardFocused: state.keyboardFocusItemId === itemId,
        isKeyboardDragging:
          state.keyboardMode === 'dragging' && state.activeItemId === itemId,
        isKeyboardTabStop: selectKeyboardTabStopItemId(state) === itemId,
      }))
    )

  const handleSpaceKey = useCallback(() =>
  {
    handleKeyboardSpaceKey(itemId)
  }, [itemId])

  const handleArrowKey = useCallback(
    (direction: KeyboardDragDirection) =>
    {
      handleKeyboardArrowKey(itemId, direction)
    },
    [itemId]
  )

  const handleEscapeKey = useCallback(() =>
  {
    handleKeyboardEscapeKey(itemId)
  }, [itemId])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) =>
    {
      if (useSettingsStore.getState().boardLocked) return

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

      if (useActiveBoardStore.getState().keyboardMode === 'idle')
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
    handleKeyboardItemFocus(itemId)
  }, [itemId])

  return {
    isKeyboardFocused,
    isKeyboardDragging,
    isKeyboardTabStop,
    onKeyDown,
    onFocus,
  }
}
