// src/features/workspace/shortcuts/model/useGlobalShortcuts.ts
// global keyboard shortcut handler — replaces useUndoRedo w/ expanded shortcuts

import { useCallback, useEffect, useState } from 'react'

import { handleKeyboardBoardJumpKey } from '@/features/workspace/boards/interaction/keyboardDragController'
import { useSettingsStore } from '@/features/workspace/settings/model/useSettingsStore'
import { useActiveBoardStore } from '@/features/workspace/boards/model/useActiveBoardStore'
import { nextToolbarPosition } from '@/shared/layout/toolbarPosition'
import { announce } from '@/shared/a11y/announce'
import { hasActiveModalLayer } from '@/shared/overlay/useModalBackgroundInert'

interface UseGlobalShortcutsOptions
{
  onExport: (type: 'png') => void
}

export const useGlobalShortcuts = ({ onExport }: UseGlobalShortcutsOptions) =>
{
  const undo = useActiveBoardStore((state) => state.undo)
  const redo = useActiveBoardStore((state) => state.redo)

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
        if (!locked) useActiveBoardStore.getState().selectAll()
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
      // skip if already handled by a focused item's keyboard controller or
      // if a pointer drag is active (dnd-kit handles its own Escape)
      if (e.key === 'Escape')
      {
        if (e.defaultPrevented) return
        const state = useActiveBoardStore.getState()
        if (state.dragPreview !== null) return
        if (state.selectedItemIds.length > 0)
        {
          e.preventDefault()
          state.clearSelection()
        }
      }

      // delete focused item or selected items — Delete or Backspace
      if (e.key === 'Delete' || e.key === 'Backspace')
      {
        const state = useActiveBoardStore.getState()
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

    // clear selection when clicking outside any item or the bulk action bar
    const handlePointerDown = (e: PointerEvent) =>
    {
      const state = useActiveBoardStore.getState()
      if (state.selectedItemIds.length === 0) return
      if (state.dragPreview !== null) return

      const target = e.target as HTMLElement | null
      if (!target) return

      // keep selection if clicking on an item or the bulk action bar
      if (target.closest('[data-item-id], [data-bulk-action-bar]')) return

      state.clearSelection()
    }

    document.addEventListener('keydown', handler)
    document.addEventListener('pointerdown', handlePointerDown)
    return () =>
    {
      document.removeEventListener('keydown', handler)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [undo, redo, onExport])

  return {
    showShortcutsPanel,
    closeShortcutsPanel,
  }
}
