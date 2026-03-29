// src/components/ui/Toolbar.tsx
// page header — displays the board title from the store

import { Lock } from 'lucide-react'

import { useSettingsStore } from '../../store/useSettingsStore'
import { useTierListStore } from '../../store/useTierListStore'
import { DEFAULT_TITLE } from '../../utils/constants'

export const Toolbar = () =>
{
  const title = useTierListStore((state) => state.title)
  const boardLocked = useSettingsStore((state) => state.boardLocked)
  // fall back to a placeholder when the stored title is blank
  const displayTitle = title.trim() || DEFAULT_TITLE

  return (
    <header className="px-3 pb-2 pt-3 text-center">
      <h1 className="inline-flex items-center gap-2 text-3xl font-semibold tracking-tight text-[var(--t-text)] sm:text-[2.15rem]">
        {displayTitle}
        {boardLocked && (
          <Lock
            className="h-5 w-5 text-[var(--t-text-muted)]"
            strokeWidth={1.8}
          />
        )}
      </h1>
    </header>
  )
}
