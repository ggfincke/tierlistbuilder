// src/features/workspace/boards/ui/RecentlyDeletedModal.tsx
// modal listing soft-deleted cloud boards w/ restore & permanent-delete actions.
// driven by the deleted-board session facade so other tabs reflect changes

import { BaseModal } from '~/shared/overlay/BaseModal'
import { ConfirmDialog } from '~/shared/overlay/ConfirmDialog'
import { ModalHeader } from '~/shared/overlay/ModalHeader'
import { useId, useState } from 'react'
import { RefreshCw, RotateCcw, Trash2 } from 'lucide-react'

import { BOARD_TOMBSTONE_RETENTION_MS } from '@tierlistbuilder/contracts/workspace/board'
import {
  permanentlyDeleteDeletedBoardSession,
  restoreDeletedBoardSession,
  RestoreBoardError,
  useDeletedBoardSessions,
} from '~/features/workspace/boards/model/deletedBoardSession'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { switchBoardSession } from '~/features/workspace/boards/model/boardSession'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { toast } from '~/shared/notifications/useToastStore'
import { logger } from '~/shared/lib/logger'

interface RecentlyDeletedModalProps
{
  open: boolean
  onClose: () => void
  enabled: boolean
}

const formatPermanentDeleteDate = (deletedAt: number): string =>
{
  const target = new Date(deletedAt + BOARD_TOMBSTONE_RETENTION_MS)
  return target.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year:
      target.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  })
}

// map RestoreBoardError codes to short user-facing text. keeps raw external
// IDs out of toast messages while preserving console traceability via the
// error's cause field
const restoreErrorToastText = (error: unknown): string =>
{
  if (error instanceof RestoreBoardError)
  {
    switch (error.code)
    {
      case 'concurrent-hard-delete':
        return 'This board was permanently deleted elsewhere.'
      case 'persist-failed':
        return "Couldn't save the restored board locally. Try freeing up storage."
      case 'cloud-error':
        return 'Failed to restore board. Please try again.'
    }
  }
  return 'Failed to restore board. Please try again.'
}

interface PendingPermanentDelete
{
  externalId: string
  title: string
}

export const RecentlyDeletedModal = ({
  open,
  onClose,
  enabled,
}: RecentlyDeletedModalProps) =>
{
  const titleId = useId()
  const deletedBoards = useDeletedBoardSessions(enabled)

  // per-row "in flight" tracking by externalId so multiple rows can have
  // their actions in flight at once w/o the buttons fighting over a single
  // boolean. set membership tells the row what to render
  const [restoringIds, setRestoringIds] = useState<Set<string>>(new Set())
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] =
    useState<PendingPermanentDelete | null>(null)

  const updateIdSet = (
    setter: typeof setRestoringIds,
    externalId: string,
    action: 'add' | 'delete'
  ): void =>
  {
    setter((current) =>
    {
      const has = current.has(externalId)
      if (action === 'add' && has) return current
      if (action === 'delete' && !has) return current
      const next = new Set(current)
      if (action === 'add') next.add(externalId)
      else next.delete(externalId)
      return next
    })
  }

  const handleRestore = async (externalId: string): Promise<void> =>
  {
    updateIdSet(setRestoringIds, externalId, 'add')
    try
    {
      const result = await restoreDeletedBoardSession(externalId)
      const message = result.alreadyInRegistry
        ? `"${result.meta.title}" is already in your lists.`
        : `Restored "${result.meta.title}".`
      toast(message, 'success')

      // switch to the restored board so the user lands on it. switching
      // a board that's already active is a no-op so this is safe even
      // when the board was already in the registry
      const registry = useWorkspaceBoardRegistryStore.getState()
      if (registry.activeBoardId !== result.meta.id)
      {
        await switchBoardSession(result.meta.id)
      }
    }
    catch (error)
    {
      logger.warn('sync', 'Restore board failed:', error)
      toast(restoreErrorToastText(error), 'error')
    }
    finally
    {
      updateIdSet(setRestoringIds, externalId, 'delete')
    }
  }

  const handlePermanentDeleteRequest = (
    board: PendingPermanentDelete
  ): void =>
  {
    setConfirmDelete(board)
  }

  const handlePermanentDeleteConfirm = async (): Promise<void> =>
  {
    if (!confirmDelete) return
    const target = confirmDelete
    setConfirmDelete(null)
    updateIdSet(setDeletingIds, target.externalId, 'add')
    try
    {
      await permanentlyDeleteDeletedBoardSession(target.externalId)
      toast(`"${target.title}" was permanently deleted.`, 'success')
    }
    catch (error)
    {
      logger.warn('sync', 'Permanent delete failed:', error)
      toast('Failed to permanently delete board.', 'error')
    }
    finally
    {
      updateIdSet(setDeletingIds, target.externalId, 'delete')
    }
  }

  const renderBody = () =>
  {
    if (deletedBoards === undefined)
    {
      return (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="h-4 w-4 animate-spin text-[var(--t-text-muted)]" />
          <span className="ml-2 text-sm text-[var(--t-text-muted)]">
            Loading…
          </span>
        </div>
      )
    }

    if (deletedBoards.length === 0)
    {
      return (
        <p className="py-8 text-center text-sm text-[var(--t-text-muted)]">
          No recently deleted boards.
        </p>
      )
    }

    return (
      <div className="max-h-[60vh] overflow-y-auto">
        {deletedBoards.map((board) =>
        {
          const restoring = restoringIds.has(board.externalId)
          const deleting = deletingIds.has(board.externalId)
          const busy = restoring || deleting
          return (
            <div
              key={board.externalId}
              className="flex items-center gap-3 border-b border-[var(--t-border)] px-1 py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[var(--t-text)]">
                  {board.title || 'Untitled'}
                </div>
                <div className="mt-0.5 text-xs text-[var(--t-text-muted)]">
                  Will be permanently deleted on{' '}
                  {formatPermanentDeleteDate(board.deletedAt)}
                </div>
              </div>
              <SecondaryButton
                size="sm"
                variant="surface"
                disabled={busy}
                onClick={() =>
                {
                  void handleRestore(board.externalId)
                }}
                aria-label={`Restore ${board.title || 'Untitled'}`}
              >
                {restoring ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                Restore
              </SecondaryButton>
              <SecondaryButton
                size="sm"
                variant="surface"
                tone="destructive"
                disabled={busy}
                onClick={() =>
                  handlePermanentDeleteRequest({
                    externalId: board.externalId,
                    title: board.title || 'Untitled',
                  })
                }
                aria-label={`Permanently delete ${board.title || 'Untitled'}`}
              >
                {deleting ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Delete forever
              </SecondaryButton>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <>
      <BaseModal
        open={open}
        onClose={onClose}
        labelledBy={titleId}
        panelClassName="flex w-full max-w-xl flex-col p-4"
      >
        <div className="mb-2 flex items-center justify-between gap-4">
          <ModalHeader titleId={titleId}>Recently deleted</ModalHeader>
          <SecondaryButton size="sm" onClick={onClose}>
            Done
          </SecondaryButton>
        </div>
        <p className="mb-3 text-xs text-[var(--t-text-muted)]">
          Deleted boards remain restorable for 30 days, then are removed
          permanently. Use Restore to bring a board back into your lists.
        </p>
        {renderBody()}
      </BaseModal>

      {confirmDelete && (
        <ConfirmDialog
          open
          title="Permanently delete board?"
          description={`"${confirmDelete.title}" will be removed for good. This can't be undone.`}
          confirmText="Delete forever"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() =>
          {
            void handlePermanentDeleteConfirm()
          }}
        />
      )}
    </>
  )
}
