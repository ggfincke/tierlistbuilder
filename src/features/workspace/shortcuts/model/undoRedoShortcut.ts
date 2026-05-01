// src/features/workspace/shortcuts/model/undoRedoShortcut.ts
// shared Cmd/Ctrl undo-redo keyboard shortcut: pure detector + runtime runner

import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { toast } from '~/shared/notifications/useToastStore'

type UndoRedoShortcut = 'undo' | 'redo'

export const isEditableShortcutTarget = (
  target: EventTarget | null
): boolean =>
{
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

const getUndoRedoShortcut = (
  event: Pick<
    KeyboardEvent,
    'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'
  >
): UndoRedoShortcut | null =>
{
  const mod = event.ctrlKey || event.metaKey
  if (!mod || event.altKey) return null
  const key = event.key.toLowerCase()
  if (key === 'z' && !event.shiftKey) return 'undo'
  if ((key === 'z' && event.shiftKey) || key === 'y') return 'redo'
  return null
}

interface RunUndoRedoShortcutOptions
{
  // called after preventDefault but before the undo/redo runs — useful for
  // flushing pending edits in modals so the resulting history snapshot is sane
  beforeRun?: () => void
  // when truthy, the shortcut is silently consumed (preventDefault still
  // runs to suppress native browser undo) — for drag-active or locked boards
  guard?: () => boolean
}

// detects + runs the undo/redo shortcut against the active board store.
// returns true when consumed (caller should stop processing other shortcuts
// in this listener); false when not an undo/redo combo or target is editable
export const runUndoRedoShortcut = (
  event: KeyboardEvent,
  options: RunUndoRedoShortcutOptions = {}
): boolean =>
{
  const direction = getUndoRedoShortcut(event)
  if (!direction) return false
  if (isEditableShortcutTarget(event.target)) return false
  event.preventDefault()
  if (options.guard?.()) return true
  options.beforeRun?.()
  const store = useActiveBoardStore.getState()
  const result = direction === 'undo' ? store.undo() : store.redo()
  if (result)
  {
    toast(
      `${direction === 'undo' ? 'Undid' : 'Redid'} ${result.label.toLowerCase()}`
    )
  }
  return true
}
