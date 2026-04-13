// src/features/workspace/boards/interaction/useKeyboardDrag.ts
// keyboard browse & drag controller for tier list items

import { useCallback } from 'react'

import { useSettingsStore } from '@/features/workspace/settings/model/useSettingsStore'
import { useActiveBoardStore } from '@/features/workspace/boards/model/useActiveBoardStore'
import {
  KEYBOARD_DIRECTIONS,
  handleKeyboardArrowKey,
  handleKeyboardEscapeKey,
  handleKeyboardItemFocus,
  handleKeyboardSpaceKey,
} from './keyboardDragController'
import type { KeyboardDragDirection } from '@/features/workspace/boards/dnd/dragKeyboard'

// keyboard browse & drag hook — returns reactive state & event handlers
export const useKeyboardDrag = (itemId: string) =>
{
  const isKeyboardFocused = useActiveBoardStore(
    (state) => state.keyboardFocusItemId === itemId
  )
  const isKeyboardDragging = useActiveBoardStore(
    (state) =>
      state.keyboardMode === 'dragging' && state.activeItemId === itemId
  )
  const isKeyboardTabStop = useActiveBoardStore((state) =>
  {
    if (state.keyboardFocusItemId)
    {
      return state.keyboardFocusItemId === itemId
    }

    const firstTierItemId =
      state.tiers.find((tier) => tier.itemIds.length > 0)?.itemIds[0] ?? null
    const firstBoardItemId = firstTierItemId ?? state.unrankedItemIds[0] ?? null

    return firstBoardItemId === itemId
  })

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
