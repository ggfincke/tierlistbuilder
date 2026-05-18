// src/features/library/model/useDeleteLibraryBoard.ts
// deletion driver for library rows — delegates to deleteBoardSession when the
// board is in the workspace registry, falls back to a direct cloud soft-delete

import { useCallback, useState } from 'react'

import { asBoardId, type BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type {
  LibraryBoardListItem,
  SyncState,
} from '@tierlistbuilder/contracts/workspace/board'
import { deleteBoardImperative } from '~/features/workspace/boards/data/cloud/boardRepository'
import { deleteBoardSession } from '~/features/workspace/boards/model/boardSession'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { toast } from '~/shared/notifications/useToastStore'

import { useLibraryBoardAction } from './useLibraryBoardAction'

interface DeleteLibraryBoardTarget
{
  externalId: BoardId
  title: string
  syncState: SyncState
}

interface DeleteLibraryBoardAction
{
  requestDelete: (board: LibraryBoardListItem) => void
  cancelDelete: () => void
  confirmDelete: () => Promise<void>
  pendingExternalId: BoardId | null
  confirmTarget: DeleteLibraryBoardTarget | null
}

export const useDeleteLibraryBoard = (): DeleteLibraryBoardAction =>
{
  const [confirmTarget, setConfirmTarget] =
    useState<DeleteLibraryBoardTarget | null>(null)
  const { run, pendingExternalId } = useLibraryBoardAction()

  const requestDelete = useCallback((board: LibraryBoardListItem): void =>
  {
    setConfirmTarget({
      externalId: asBoardId(board.externalId),
      title: board.title,
      syncState: board.syncState,
    })
  }, [])

  const cancelDelete = useCallback((): void =>
  {
    setConfirmTarget(null)
  }, [])

  const confirmDelete = useCallback(async (): Promise<void> =>
  {
    if (!confirmTarget) return
    const target = confirmTarget

    const registry = useWorkspaceBoardRegistryStore.getState()
    const inRegistry = registry.boards.some(
      (board) => board.id === target.externalId
    )
    if (inRegistry && registry.boards.length <= 1)
    {
      toast('At least one board has to stay in your workspace.', 'error')
      return
    }

    setConfirmTarget(null)

    await run(
      target.externalId,
      {
        errorMessage: 'Failed to delete board. Please try again.',
        logTag: 'Delete library board failed',
      },
      async () =>
      {
        if (inRegistry)
        {
          await deleteBoardSession(target.externalId)
        }
        else
        {
          // cloud-only row — soft-delete via the mutation directly so it
          // still lands in Recently deleted
          await deleteBoardImperative({ boardExternalId: target.externalId })
        }

        const restorable = target.syncState !== 'localOnly'
        toast(
          restorable
            ? `Moved "${target.title}" to Recently deleted.`
            : `Deleted "${target.title}".`,
          'success'
        )
      }
    )
  }, [confirmTarget, run])

  return {
    requestDelete,
    cancelDelete,
    confirmDelete,
    pendingExternalId,
    confirmTarget,
  }
}
