// src/hooks/useUndoRedo.ts
// register Ctrl+Z / Ctrl+Shift+Z keyboard shortcuts for undo & redo

import { useEffect } from 'react'

import { useTierListStore } from '../store/useTierListStore'

export const useUndoRedo = () =>
{
  const undo = useTierListStore((state) => state.undo)
  const redo = useTierListStore((state) => state.redo)

  useEffect(() =>
  {
    const handler = (e: KeyboardEvent) =>
    {
      // skip when focus is inside a text input or editable element
      const el = document.activeElement as HTMLElement | null
      if (!el)
      {
        return
      }
      const tag = el.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable)
      {
        return
      }

      const mod = e.ctrlKey || e.metaKey
      if (!mod)
      {
        return
      }

      if (e.key === 'z' && !e.shiftKey)
      {
        e.preventDefault()
        undo()
      }

      if ((e.key === 'z' && e.shiftKey) || e.key === 'y')
      {
        e.preventDefault()
        redo()
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [undo, redo])
}
