// src/features/library/model/useDeleteLibraryBoard.ts
// deletion driver for library rows — delegates to deleteBoardSession

import { useCallback, useState } from 'react'

import { asBoardId, type BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { LibraryBoardListItem } from '@tierlistbuilder/contracts/workspace/board'
import { deleteBoardSession } from '~/features/workspace/boards/model/boardSession'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { toast } from '~/shared/notifications/useToastStore'

import { useLibraryBoardAction } from '~/features/library/model/useLibraryBoardAction'

interface DeleteLibraryBoardTarget
{
  externalId: BoardId
  title: string
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
    if (registry.boards.length <= 1)
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
        await deleteBoardSession(target.externalId)
        toast(`Deleted "${target.title}".`, 'success')
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
