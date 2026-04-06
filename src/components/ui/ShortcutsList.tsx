// src/components/ui/ShortcutsList.tsx
// shared rendering for the global keyboard shortcuts reference

import { SHORTCUTS, type ShortcutDefinition } from '../../utils/shortcuts'

interface ShortcutsListProps
{
  shortcuts?: readonly ShortcutDefinition[]
  className?: string
}

export const ShortcutsList = ({
  shortcuts = SHORTCUTS,
  className = '',
}: ShortcutsListProps) => (
  <div className={`space-y-2.5 ${className}`}>
    {shortcuts.map((shortcut) => (
      <div
        key={shortcut.description}
        className="flex items-center justify-between gap-3"
      >
        <span className="text-sm text-[var(--t-text-secondary)]">
          {shortcut.description}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {shortcut.keys.map((key) => (
            <kbd
              key={key}
              className="rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-1.5 py-0.5 font-mono text-xs text-[var(--t-text)]"
            >
              {key}
            </kbd>
          ))}
        </div>
      </div>
    ))}
  </div>
)
