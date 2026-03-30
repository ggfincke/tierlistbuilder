// src/hooks/useKeyboardDrag.ts
// keyboard browse & drag controller for tier list items

import { useCallback } from 'react'

import { useSettingsStore } from '../store/useSettingsStore'
import { useTierListStore } from '../store/useTierListStore'
import {
  KEYBOARD_DIRECTIONS,
  handleKeyboardArrowKey,
  handleKeyboardEscapeKey,
  handleKeyboardItemFocus,
  handleKeyboardSpaceKey,
} from './keyboardDragController'
import type { KeyboardDragDirection } from '../utils/dragKeyboard'

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
    handleKeyboardItemFocus(itemId)
  }, [itemId])

  return { isKeyboardFocused, isKeyboardDragging, onKeyDown, onFocus }
}
