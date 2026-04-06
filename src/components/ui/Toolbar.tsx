// src/components/ui/Toolbar.tsx
// page header — click-to-edit board title

import { Lock } from 'lucide-react'
import { useEffect, useId } from 'react'

import { useInlineEdit } from '../../hooks/useInlineEdit'
import { renameBoardSession } from '../../services/boardSession'
import { useBoardManagerStore } from '../../store/useBoardManagerStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useTierListStore } from '../../store/useTierListStore'
import { DEFAULT_TITLE } from '../../utils/constants'
import { TextInput } from './TextInput'

const TITLE_EDITOR_ID = 'toolbar-title'

export const Toolbar = () =>
{
  const title = useTierListStore((state) => state.title)
  const activeBoardId = useBoardManagerStore((state) => state.activeBoardId)
  const boardLocked = useSettingsStore((state) => state.boardLocked)
  const titleInputId = useId()
  const { cancelEdit, getInputProps, inputRef, isEditing, startEdit } =
    useInlineEdit<typeof TITLE_EDITOR_ID>({
      onCommit: (_, value) =>
      {
        if (activeBoardId)
        {
          renameBoardSession(activeBoardId, value)
        }
      },
    })

  const displayTitle = title.trim() || DEFAULT_TITLE
  const editing = isEditing(TITLE_EDITOR_ID)

  const startEditing = () =>
  {
    if (boardLocked || !activeBoardId)
    {
      return
    }

    startEdit(TITLE_EDITOR_ID, title)
  }

  useEffect(() =>
  {
    if (boardLocked)
    {
      cancelEdit()
    }
  }, [boardLocked, cancelEdit])

  return (
    <header className="px-3 pb-2 pt-3 text-center">
      <h1 className="inline-flex items-center gap-2 text-3xl font-semibold tracking-tight text-[var(--t-text)] sm:text-[2.15rem]">
        {editing ? (
          <>
            <label htmlFor={titleInputId} className="sr-only">
              Board title
            </label>
            <TextInput
              id={titleInputId}
              ref={inputRef}
              variant="ghost"
              size="xs"
              {...getInputProps({
                maxLength: 60,
                className:
                  '!px-0 !py-0 !text-3xl border-none text-center font-semibold tracking-tight focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] sm:!text-[2.15rem]',
              })}
            />
          </>
        ) : (
          <>
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
          </>
        )}
      </h1>
    </header>
  )
}
