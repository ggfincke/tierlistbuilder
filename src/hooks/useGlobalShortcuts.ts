// src/hooks/useGlobalShortcuts.ts
// global keyboard shortcut handler — replaces useUndoRedo w/ expanded shortcuts

import { useCallback, useEffect, useState } from 'react'

import { hasActiveModalLayer } from './useModalBackgroundInert'
import { useSettingsStore } from '../store/useSettingsStore'
import { useTierListStore } from '../store/useTierListStore'

interface UseGlobalShortcutsOptions
{
  onExport: (type: 'png') => void
}

export const useGlobalShortcuts = ({ onExport }: UseGlobalShortcutsOptions) =>
{
  const undo = useTierListStore((state) => state.undo)
  const redo = useTierListStore((state) => state.redo)

  const [showShortcutsPanel, setShowShortcutsPanel] = useState(false)

  const toggleShortcutsPanel = useCallback(
    () => setShowShortcutsPanel((prev) => !prev),
    []
  )
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

      // skip remaining shortcuts when modifiers are held
      if (mod || e.altKey) return

      // delete focused item — Delete or Backspace
      if (e.key === 'Delete' || e.key === 'Backspace')
      {
        const state = useTierListStore.getState()
        const locked = useSettingsStore.getState().boardLocked
        if (
          !locked &&
          state.keyboardMode === 'browse' &&
          state.keyboardFocusItemId
        )
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
    toggleShortcutsPanel,
    closeShortcutsPanel,
  }
}
