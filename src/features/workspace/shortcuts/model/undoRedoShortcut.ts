// src/features/workspace/shortcuts/model/undoRedoShortcut.ts
// shared Cmd/Ctrl undo-redo keyboard shortcut helpers

export type UndoRedoShortcut = 'undo' | 'redo'

export const isEditableShortcutTarget = (
  target: EventTarget | null
): boolean =>
{
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

export const getUndoRedoShortcut = (
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
