// src/components/ui/Toolbar.tsx
// page header — click-to-edit board title

import { Lock } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

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
  const titleInputId = useId()

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
        <>
          <label htmlFor={titleInputId} className="sr-only">
            Board title
          </label>
          <input
            id={titleInputId}
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
            className="focus-custom w-full max-w-md border-none bg-transparent text-center text-3xl font-semibold tracking-tight text-[var(--t-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] sm:text-[2.15rem]"
            maxLength={60}
          />
        </>
      ) : (
        <h1 className="inline-flex items-center gap-2 text-3xl font-semibold tracking-tight text-[var(--t-text)] sm:text-[2.15rem]">
          {boardLocked ? (
            <span>{displayTitle}</span>
          ) : (
            <button
              type="button"
              onClick={startEditing}
              aria-label={`Edit board title: ${displayTitle}`}
              className="focus-custom rounded-md cursor-text hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
            >
              {displayTitle}
            </button>
          )}
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
