// src/features/platform/sync/conflicts/ConflictResolverModal.tsx
// blocking modal for unresolved sync conflicts — opens for the head of
// useConflictQueueStore; cannot be dismissed w/o picking a resolution action

import { useCallback, useId, useMemo, useState } from 'react'

import type { Doc } from '@convex/_generated/dataModel'
import { BaseModal } from '~/shared/overlay/BaseModal'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { getUserStableId } from '~/features/platform/auth/model/userIdentity'
import { pluralizeWord } from '~/shared/lib/pluralize'
import {
  resolveKeepBoth,
  resolveKeepCloud,
  resolveKeepLocal,
  type ResolveContext,
  type ResolveOutcome,
} from './conflictResolver'
import {
  selectCurrentConflict,
  useConflictQueueStore,
  type ConflictEntry,
} from './useConflictQueueStore'

interface ConflictResolverModalProps
{
  user: Doc<'users'> | null
}

type ResolutionKey = 'keep-local' | 'keep-cloud' | 'keep-both'

interface ConflictActionButtonProps
{
  title: string
  description: string
  busyLabel: string
  busy: boolean
  disabled: boolean
  onClick: () => void
}

const ConflictActionButton = ({
  title,
  description,
  busyLabel,
  busy,
  disabled,
  onClick,
}: ConflictActionButtonProps) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className="focus-custom rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-3 py-2 text-left text-sm hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-active)] disabled:cursor-not-allowed disabled:opacity-50"
  >
    <div className="font-medium text-[var(--t-text)]">
      {busy ? busyLabel : title}
    </div>
    <div className="text-xs text-[var(--t-text-muted)]">{description}</div>
  </button>
)

export const ConflictResolverModal = ({ user }: ConflictResolverModalProps) =>
{
  const current = useConflictQueueStore(selectCurrentConflict)
  if (!current || !user)
  {
    return null
  }

  return (
    <ConflictResolverDialog
      key={current.boardId}
      current={current}
      user={user}
    />
  )
}

interface ConflictResolverDialogProps
{
  current: ConflictEntry
  user: Doc<'users'>
}

const ConflictResolverDialog = ({
  current,
  user,
}: ConflictResolverDialogProps) =>
{
  const dismiss = useConflictQueueStore((state) => state.dismiss)
  const remainingCount = useConflictQueueStore((state) =>
    Math.max(0, state.entries.length - 1)
  )
  const boards = useWorkspaceBoardRegistryStore((state) => state.boards)
  const titleId = useId()
  const descId = useId()
  const [busy, setBusy] = useState<ResolutionKey | null>(null)
  const [error, setError] = useState<string | null>(null)

  const boardTitle = useMemo(() =>
  {
    const meta = boards.find((b) => b.id === current.boardId)
    return meta?.title ?? current.serverState.title ?? 'Untitled board'
  }, [boards, current])

  const handleResolve = useCallback(
    async (
      key: ResolutionKey,
      runner: () => Promise<ResolveOutcome>
    ): Promise<void> =>
    {
      setBusy(key)
      setError(null)
      const outcome = await runner()
      if (outcome.ok)
      {
        dismiss(current.boardId)
      }
      else
      {
        setError(outcome.error)
      }
      setBusy(null)
    },
    [current, dismiss]
  )

  const userId = getUserStableId(user)
  const ctx: ResolveContext = {
    boardId: current.boardId,
    serverState: current.serverState,
    userId,
  }

  const isBusy = busy !== null

  return (
    <BaseModal
      open
      role="alertdialog"
      labelledBy={titleId}
      describedBy={descId}
      closeOnEscape={false}
      closeOnBackdrop={false}
      panelClassName="w-full max-w-md p-5"
    >
      <h2 id={titleId} className="text-lg font-semibold text-[var(--t-text)]">
        Conflicting edits
      </h2>
      <p id={descId} className="mt-2 text-sm text-[var(--t-text-muted)]">
        <span className="font-medium text-[var(--t-text)]">{boardTitle}</span>{' '}
        was edited on another device while you were offline. Choose which
        version to keep.
      </p>

      <div className="mt-4 flex flex-col gap-2">
        <ConflictActionButton
          title="Keep this device"
          description="Overwrite the cloud copy with what you have locally."
          busyLabel="Keeping this device…"
          busy={busy === 'keep-local'}
          disabled={isBusy}
          onClick={() =>
            handleResolve('keep-local', () => resolveKeepLocal(ctx))
          }
        />

        <ConflictActionButton
          title="Keep cloud version"
          description="Discard local edits & load the cloud copy."
          busyLabel="Loading cloud…"
          busy={busy === 'keep-cloud'}
          disabled={isBusy}
          onClick={() =>
            handleResolve('keep-cloud', () =>
              resolveKeepCloud({
                boardId: ctx.boardId,
                serverState: ctx.serverState,
              })
            )
          }
        />

        <ConflictActionButton
          title="Keep both copies"
          description="Save your local edits as a new board, then load the cloud copy here."
          busyLabel="Saving both…"
          busy={busy === 'keep-both'}
          disabled={isBusy}
          onClick={() => handleResolve('keep-both', () => resolveKeepBoth(ctx))}
        />
      </div>

      {error && (
        <p className="mt-3 rounded border border-[color-mix(in_srgb,var(--t-destructive)_60%,transparent)] bg-[color-mix(in_srgb,var(--t-destructive)_10%,transparent)] px-2 py-1.5 text-xs text-[var(--t-destructive-hover)]">
          {error}
        </p>
      )}

      {remainingCount > 0 && (
        <p className="mt-3 text-xs text-[var(--t-text-faint)]">
          {remainingCount} more {pluralizeWord(remainingCount, 'conflict')}{' '}
          after this one.
        </p>
      )}
    </BaseModal>
  )
}
