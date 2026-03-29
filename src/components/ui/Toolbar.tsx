// src/components/ui/Toolbar.tsx
// page header — click-to-edit board title

import { Lock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { renameBoardSession } from '../../services/boardSession'
import { useBoardManagerStore } from '../../store/useBoardManagerStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useTierListStore } from '../../store/useTierListStore'
import { DEFAULT_TITLE } from '../../utils/constants'

export const Toolbar = () =>
{
  const title = useTierListStore((state) => state.title)
  const activeBoardId = useBoardManagerStore((state) => state.activeBoardId)
  const boardLocked = useSettingsStore((state) => state.boardLocked)

  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const displayTitle = title.trim() || DEFAULT_TITLE

  const startEditing = () =>
  {
    if (boardLocked) return
    setEditValue(title)
    setEditing(true)
  }

  const commitEdit = () =>
  {
    setEditing(false)
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== title)
    {
      renameBoardSession(activeBoardId, trimmed)
    }
  }

  useEffect(() =>
  {
    if (editing)
    {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  return (
    <header className="px-3 pb-2 pt-3 text-center">
      {editing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) =>
          {
            if (e.key === 'Enter') commitEdit()
            if (e.key === 'Escape')
            {
              setEditing(false)
            }
          }}
          className="w-full max-w-md border-none bg-transparent text-center text-3xl font-semibold tracking-tight text-[var(--t-text)] outline-none sm:text-[2.15rem]"
          maxLength={60}
        />
      ) : (
        <h1
          onClick={startEditing}
          className={`inline-flex items-center gap-2 text-3xl font-semibold tracking-tight text-[var(--t-text)] sm:text-[2.15rem] ${
            !boardLocked ? 'cursor-text hover:opacity-80' : ''
          }`}
        >
          {displayTitle}
          {boardLocked && (
            <Lock
              className="h-5 w-5 text-[var(--t-text-muted)]"
              strokeWidth={1.8}
            />
          )}
        </h1>
      )}
    </header>
  )
}
