// src/hooks/useGlobalShortcuts.ts
// global keyboard shortcut handler — replaces useUndoRedo w/ expanded shortcuts

import { useCallback, useEffect, useState } from 'react'

import { handleKeyboardBoardJumpKey } from './keyboardDragController'
import { hasActiveModalLayer } from './useModalBackgroundInert'
import { useSettingsStore } from '../store/useSettingsStore'
import { useTierListStore } from '../store/useTierListStore'
import { nextToolbarPosition } from '../utils/menuPosition'
import { announce } from '../utils/announce'

interface UseGlobalShortcutsOptions
{
  onExport: (type: 'png') => void
}

export const useGlobalShortcuts = ({ onExport }: UseGlobalShortcutsOptions) =>
{
  const undo = useTierListStore((state) => state.undo)
  const redo = useTierListStore((state) => state.redo)

  const [showShortcutsPanel, setShowShortcutsPanel] = useState(false)

  const closeShortcutsPanel = useCallback(
    () => setShowShortcutsPanel(false),
    []
  )

  useEffect(() =>
  {
    const handler = (e: KeyboardEvent) =>
    {
      // skip when focus is inside a text input or editable element
      const el = document.activeElement as HTMLElement | null
      if (!el) return
      const tag = el.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable) return
      if (hasActiveModalLayer()) return

      const mod = e.ctrlKey || e.metaKey

      // undo — Ctrl/Cmd+Z
      if (mod && e.key === 'z' && !e.shiftKey)
      {
        e.preventDefault()
        undo()
        return
      }

      // redo — Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y
      if (mod && ((e.key === 'z' && e.shiftKey) || e.key === 'y'))
      {
        e.preventDefault()
        redo()
        return
      }

      // export — Ctrl/Cmd+S
      if (mod && e.key === 's')
      {
        e.preventDefault()
        const locked = useSettingsStore.getState().boardLocked
        if (!locked) onExport('png')
        return
      }

      // cycle toolbar position — Ctrl/Cmd+Shift+T
      if (mod && e.shiftKey && e.key === 'T')
      {
        e.preventDefault()
        const { toolbarPosition, setToolbarPosition } =
          useSettingsStore.getState()
        const next = nextToolbarPosition(toolbarPosition)
        setToolbarPosition(next)
        announce(`Toolbar moved to ${next}`)
        return
      }

      // select all items — Ctrl/Cmd+A
      if (mod && e.key === 'a')
      {
        e.preventDefault()
        const locked = useSettingsStore.getState().boardLocked
        if (!locked) useTierListStore.getState().selectAll()
        return
      }

      // skip remaining shortcuts when modifiers are held
      if (mod || e.altKey) return

      // jump back to the board from non-editable UI
      if (!e.shiftKey && e.key.toLowerCase() === 'b')
      {
        e.preventDefault()
        handleKeyboardBoardJumpKey()
        return
      }

      // clear bulk selection — Escape
      // skip if already handled by a focused item's keyboard controller
      if (e.key === 'Escape')
      {
        if (e.defaultPrevented) return
        const state = useTierListStore.getState()
        if (state.selectedItemIds.length > 0)
        {
          e.preventDefault()
          state.clearSelection()
          return
        }
      }

      // delete focused item or selected items — Delete or Backspace
      if (e.key === 'Delete' || e.key === 'Backspace')
      {
        const state = useTierListStore.getState()
        const locked = useSettingsStore.getState().boardLocked
        if (locked) return

        // bulk delete when items are selected
        if (state.selectedItemIds.length > 0)
        {
          e.preventDefault()
          state.deleteSelectedItems()
          return
        }

        if (state.keyboardMode !== 'dragging' && state.keyboardFocusItemId)
        {
          e.preventDefault()
          state.removeItem(state.keyboardFocusItemId)
        }
        return
      }

      // shortcuts panel — ? key
      if (e.key === '?')
      {
        setShowShortcutsPanel((prev) => !prev)
        return
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [undo, redo, onExport])

  return {
    showShortcutsPanel,
    closeShortcutsPanel,
  }
}
