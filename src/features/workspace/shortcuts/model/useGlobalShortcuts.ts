// src/features/workspace/shortcuts/model/useGlobalShortcuts.ts
// global keyboard shortcut handler — replaces useUndoRedo w/ expanded shortcuts

import { useCallback, useEffect, useState } from 'react'

import { handleKeyboardBoardJumpKey } from '~/features/workspace/boards/interaction/keyboardDragController'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import {
  selectIsDragging,
  useActiveBoardStore,
} from '~/features/workspace/boards/model/useActiveBoardStore'
import { nextToolbarPosition } from '~/shared/layout/toolbarPosition'
import { announce } from '~/shared/a11y/announce'
import { toast } from '~/shared/notifications/useToastStore'
import { hasActiveModalLayer } from '~/shared/overlay/useModalBackgroundInert'

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
      // normalize once — Shift flips printable keys to uppercase, which broke
      // Ctrl/Cmd+Shift+Z since we compared against lowercase 'z'
      const key = e.key.toLowerCase()

      // drop Ctrl/Cmd+Z/Y mid-drag — dnd-kit still holds its own active state,
      // & undoing out from under it leaves the overlay & refs stranded
      const dragActive = selectIsDragging(useActiveBoardStore.getState())

      // undo — Ctrl/Cmd+Z
      if (mod && key === 'z' && !e.shiftKey)
      {
        e.preventDefault()
        const locked = useSettingsStore.getState().boardLocked
        if (dragActive || locked) return
        const result = undo()
        if (result) toast(`Undid ${result.label.toLowerCase()}`)
        return
      }

      // redo — Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y
      if (mod && ((key === 'z' && e.shiftKey) || key === 'y'))
      {
        e.preventDefault()
        const locked = useSettingsStore.getState().boardLocked
        if (dragActive || locked) return
        const result = redo()
        if (result) toast(`Redid ${result.label.toLowerCase()}`)
        return
      }

      // export — Ctrl/Cmd+S
      if (mod && key === 's')
      {
        e.preventDefault()
        const locked = useSettingsStore.getState().boardLocked
        if (!locked) onExport('png')
        return
      }

      // cycle toolbar position — Ctrl/Cmd+Shift+T
      if (mod && e.shiftKey && key === 't')
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
      if (mod && key === 'a')
      {
        e.preventDefault()
        const locked = useSettingsStore.getState().boardLocked
        if (!locked) useActiveBoardStore.getState().selectAll()
        return
      }

      // skip remaining shortcuts when modifiers are held
      if (mod || e.altKey) return

      // jump back to the board from non-editable UI
      if (!e.shiftKey && key === 'b')
      {
        e.preventDefault()
        handleKeyboardBoardJumpKey()
        return
      }

      // clear bulk selection — Escape
      // skip if already handled by a focused item's keyboard controller or
      // if a pointer drag is active (dnd-kit handles its own Escape)
      if (key === 'escape')
      {
        if (e.defaultPrevented) return
        const state = useActiveBoardStore.getState()
        if (selectIsDragging(state)) return
        if (state.selection.ids.length > 0)
        {
          e.preventDefault()
          state.clearSelection()
        }
        return
      }

      // delete focused item or selected items — Delete or Backspace
      if (key === 'delete' || key === 'backspace')
      {
        const state = useActiveBoardStore.getState()
        const locked = useSettingsStore.getState().boardLocked
        if (locked) return

        // bulk delete when items are selected
        if (state.selection.ids.length > 0)
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
      if (key === '?')
      {
        setShowShortcutsPanel((prev) => !prev)
        return
      }
    }

    // clear selection when clicking outside any item or the bulk action bar
    const handlePointerDown = (e: PointerEvent) =>
    {
      const state = useActiveBoardStore.getState()
      if (state.selection.ids.length === 0) return
      if (selectIsDragging(state)) return

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
