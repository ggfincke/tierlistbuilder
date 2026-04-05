// src/utils/shortcuts.ts
// shared keyboard shortcut definitions & platform detection

export interface ShortcutDefinition
{
  keys: readonly string[]
  description: string
}

export const IS_MAC =
  typeof navigator !== 'undefined' && navigator.platform.startsWith('Mac')

export const MOD_KEY = IS_MAC ? 'Cmd' : 'Ctrl'

export const SHORTCUTS = [
  { keys: [MOD_KEY, 'Z'], description: 'Undo' },
  { keys: [MOD_KEY, 'Shift', 'Z'], description: 'Redo' },
  { keys: [MOD_KEY, 'S'], description: 'Export board' },
  { keys: [MOD_KEY, 'Shift', 'T'], description: 'Cycle toolbar position' },
  { keys: ['Delete'], description: 'Remove focused item' },
  {
    keys: ['Esc'],
    description: 'Close modal / cancel edit / exit keyboard mode',
  },
  { keys: ['Enter'], description: 'Confirm edit / submit' },
  { keys: ['Space'], description: 'Enter keyboard mode / pick up / drop' },
  { keys: ['Arrow Keys'], description: 'Browse items / move dragged item' },
  { keys: ['?'], description: 'Show keyboard shortcuts' },
] satisfies readonly ShortcutDefinition[]
