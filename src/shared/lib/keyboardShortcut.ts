// src/shared/lib/keyboardShortcut.ts
// strict keyboard-shortcut matcher — forbidden-by-default modifiers prevent
// the cmd-K-eats-cmd-shift-K bug class by requiring every absent flag to be UP

export interface KeyboardModifierEvent
{
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  key: string
}

export interface ShortcutSpec
{
  // matched against event.key.toLowerCase()
  key: string
  // true -> requires ctrl-or-meta to be held (the platform "mod" key)
  mod?: boolean
  shift?: boolean
  alt?: boolean
}

export const matchShortcut = (
  event: KeyboardModifierEvent,
  spec: ShortcutSpec
): boolean =>
{
  const mod = event.ctrlKey || event.metaKey
  return (
    event.key.toLowerCase() === spec.key &&
    mod === !!spec.mod &&
    event.shiftKey === !!spec.shift &&
    event.altKey === !!spec.alt
  )
}
