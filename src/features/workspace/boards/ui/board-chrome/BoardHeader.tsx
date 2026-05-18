// src/features/workspace/boards/ui/board-chrome/BoardHeader.tsx
// click-to-edit board title + publish chip beneath it

import { GitFork, Lock, Sparkles } from 'lucide-react'
import { useEffect, useId } from 'react'

import { useInlineEdit } from '~/shared/hooks/useInlineEdit'
import { renameBoardSession } from '~/features/workspace/boards/model/boardSession'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { DEFAULT_TITLE } from '~/shared/board-data/boardDefaults'
import { TextInput } from '~/shared/ui/TextInput'
import { BoardPublishChip } from '~/features/workspace/boards/ui/board-chrome/BoardPublishChip'

const TITLE_EDITOR_ID = 'toolbar-title'

interface SourceBreadcrumbProps
{
  sourceTemplateId: string | undefined
  sourceRankingId: string | undefined
  sourceTemplateTitle: string | undefined
  sourceRankingTitle: string | undefined
}

const SourceBreadcrumb = ({
  sourceTemplateId,
  sourceRankingId,
  sourceTemplateTitle,
  sourceRankingTitle,
}: SourceBreadcrumbProps) =>
{
  // ranking remix wins when both are set — sourceTemplateId is the ranking's
  // template; the user's primary source is the ranking they remixed
  if (sourceRankingId)
  {
    return (
      <p className="mt-1.5 flex items-center justify-center gap-1.5 text-xs text-[var(--t-text-muted)]">
        <Sparkles className="h-3 w-3" strokeWidth={1.8} aria-hidden />
        Remixed from{' '}
        <span className="font-medium text-[var(--t-text-secondary)]">
          {sourceRankingTitle ?? 'a ranking'}
        </span>
      </p>
    )
  }

  if (sourceTemplateId)
  {
    return (
      <p className="mt-1.5 flex items-center justify-center gap-1.5 text-xs text-[var(--t-text-muted)]">
        <GitFork className="h-3 w-3" strokeWidth={1.8} aria-hidden />
        Forked from{' '}
        <span className="font-medium text-[var(--t-text-secondary)]">
          {sourceTemplateTitle ?? 'a template'}
        </span>
      </p>
    )
  }

  return null
}

export const BoardHeader = () =>
{
  const title = useActiveBoardStore((state) => state.title)
  const sourceTemplateId = useActiveBoardStore(
    (state) => state.sourceTemplateId
  )
  const sourceRankingId = useActiveBoardStore((state) => state.sourceRankingId)
  const sourceTemplateTitle = useActiveBoardStore(
    (state) => state.sourceTemplateTitle
  )
  const sourceRankingTitle = useActiveBoardStore(
    (state) => state.sourceRankingTitle
  )
  const activeBoardId = useWorkspaceBoardRegistryStore(
    (state) => state.activeBoardId
  )
  const boardLocked = usePreferencesStore((state) => state.boardLocked)
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
      <h1 className="display-accent-shadow inline-flex items-center gap-2 text-3xl font-black leading-[1.08] tracking-[-0.025em] text-[var(--t-text)] sm:text-[2.15rem]">
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
                  '!px-0 !py-0 !text-3xl border-none text-center font-black leading-[1.08] tracking-[-0.025em] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] sm:!text-[2.15rem] min-w-[10ch] [field-sizing:content]',
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
      {/* hidden while inline-editing so chips don't jitter alongside a
          [field-sizing:content] input */}
      {!editing && (
        <>
          <SourceBreadcrumb
            sourceTemplateId={sourceTemplateId}
            sourceRankingId={sourceRankingId}
            sourceTemplateTitle={sourceTemplateTitle}
            sourceRankingTitle={sourceRankingTitle}
          />
          <div className="mt-2 flex justify-center">
            <BoardPublishChip />
          </div>
        </>
      )}
    </header>
  )
}
