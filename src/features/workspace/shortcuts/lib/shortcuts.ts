// src/features/workspace/shortcuts/lib/shortcuts.ts
// shared keyboard shortcut definitions & platform detection

export interface ShortcutDefinition
{
  keys: readonly string[]
  description: string
}

// prefer the modern UA-Data platform string; fall back to navigator.platform
// for browsers that haven't shipped it (Firefox, Safari at time of writing)
const detectPlatform = (): string =>
{
  if (typeof navigator === 'undefined') return ''
  const uaData = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData
  return uaData?.platform ?? navigator.platform ?? ''
}

export const IS_MAC = detectPlatform().toLowerCase().startsWith('mac')

export const MOD_KEY = IS_MAC ? 'Cmd' : 'Ctrl'

export const SHORTCUTS = [
  { keys: [MOD_KEY, 'Z'], description: 'Undo' },
  { keys: [MOD_KEY, 'Shift', 'Z'], description: 'Redo' },
  { keys: [MOD_KEY, 'S'], description: 'Export board' },
  { keys: [MOD_KEY, 'Shift', 'T'], description: 'Cycle toolbar position' },
  { keys: [MOD_KEY, 'A'], description: 'Select all items' },
  { keys: ['B'], description: 'Jump to the board' },
  { keys: ['Tab'], description: 'Move between UI controls' },
  { keys: ['Delete'], description: 'Remove focused item' },
  {
    keys: ['Esc'],
    description: 'Close modal / cancel edit / cancel drag / clear selection',
  },
  { keys: ['Enter'], description: 'Confirm edit / submit' },
  { keys: ['Space'], description: 'Pick up / drop focused item' },
  { keys: ['Arrow Keys'], description: 'Browse items / move dragged item' },
  { keys: ['?'], description: 'Show keyboard shortcuts' },
] satisfies readonly ShortcutDefinition[]
