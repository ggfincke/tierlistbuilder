// src/features/workspace/shortcuts/model/useGlobalShortcuts.ts
// global keyboard shortcut handler — replaces useUndoRedo w/ expanded shortcuts

import { useCallback, useEffect, useState } from 'react'

import { handleKeyboardBoardJumpKey } from '~/features/workspace/boards/interaction/keyboardDragController'
import { ITEM_DATA_ATTR } from '~/features/workspace/boards/lib/dndIds'
import { BULK_ACTION_BAR_SELECTOR } from '~/shared/board-ui/boardTestIds'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import {
  selectIsDragging,
  useActiveBoardStore,
} from '~/features/workspace/boards/model/useActiveBoardStore'
import { nextToolbarPosition } from '~/shared/overlay/toolbarPosition'
import { announce } from '~/shared/a11y/announce'
import { hasActiveModalLayer } from '~/shared/overlay/modalLayer'
import { matchShortcut } from '~/shared/lib/keyboardShortcut'
import {
  isEditableShortcutTarget,
  runUndoRedoShortcut,
} from '~/features/workspace/shortcuts/model/undoRedoShortcut'

interface UseGlobalShortcutsOptions
{
  onExport: (type: 'png') => void
}

export const useGlobalShortcuts = ({ onExport }: UseGlobalShortcutsOptions) =>
{
  const [showShortcutsPanel, setShowShortcutsPanel] = useState(false)

  const closeShortcutsPanel = useCallback(
    () => setShowShortcutsPanel(false),
    []
  )

  useEffect(() =>
  {
    const handler = (e: KeyboardEvent) =>
    {
      const el = document.activeElement
      if (!el || isEditableShortcutTarget(el)) return
      if (hasActiveModalLayer()) return

      // drop Ctrl/Cmd+Z/Y mid-drag — dnd-kit still holds its own active state,
      // & undoing out from under it leaves the overlay & refs stranded
      if (
        runUndoRedoShortcut(e, {
          guard: () =>
            selectIsDragging(useActiveBoardStore.getState()) ||
            usePreferencesStore.getState().boardLocked,
        })
      )
      {
        return
      }

      // export — Ctrl/Cmd+S
      if (matchShortcut(e, { key: 's', mod: true }))
      {
        e.preventDefault()
        const locked = usePreferencesStore.getState().boardLocked
        if (!locked) onExport('png')
        return
      }

      // cycle toolbar position — Ctrl/Cmd+Shift+T
      if (matchShortcut(e, { key: 't', mod: true, shift: true }))
      {
        e.preventDefault()
        const { toolbarPosition, setToolbarPosition } =
          usePreferencesStore.getState()
        const next = nextToolbarPosition(toolbarPosition)
        setToolbarPosition(next)
        announce(`Toolbar moved to ${next}`)
        return
      }

      // select all items — Ctrl/Cmd+A
      if (matchShortcut(e, { key: 'a', mod: true }))
      {
        e.preventDefault()
        const locked = usePreferencesStore.getState().boardLocked
        if (!locked) useActiveBoardStore.getState().selectAll()
        return
      }

      // jump back to the board from non-editable UI
      if (matchShortcut(e, { key: 'b' }))
      {
        e.preventDefault()
        handleKeyboardBoardJumpKey()
        return
      }

      // clear bulk selection — Escape
      // skip if already handled by a focused item's keyboard controller or
      // if a pointer drag is active (dnd-kit handles its own Escape)
      if (matchShortcut(e, { key: 'escape' }))
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
      if (
        matchShortcut(e, { key: 'delete' }) ||
        matchShortcut(e, { key: 'backspace' })
      )
      {
        const state = useActiveBoardStore.getState()
        const locked = usePreferencesStore.getState().boardLocked
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

      // shortcuts panel — ? glyph; `?` is shift+/ on US but bare on other
      // layouts, so match the printed character & guard mod/alt inline
      if (e.key === '?' && !(e.ctrlKey || e.metaKey) && !e.altKey)
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
      if (target.closest(`[${ITEM_DATA_ATTR}], ${BULK_ACTION_BAR_SELECTOR}`))
        return

      state.clearSelection()
    }

    document.addEventListener('keydown', handler)
    document.addEventListener('pointerdown', handlePointerDown)
    return () =>
    {
      document.removeEventListener('keydown', handler)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [onExport])

  return {
    showShortcutsPanel,
    closeShortcutsPanel,
  }
}
