// src/features/library/model/useRenameLibraryBoard.ts
// rename driver for library rows — renames via renameBoardSession

import { useCallback, useState } from 'react'

import { asBoardId, type BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { LibraryBoardListItem } from '@tierlistbuilder/contracts/workspace/board'
import { renameBoardSession } from '~/features/workspace/boards/model/boardSession'
import { toast } from '~/shared/notifications/useToastStore'

import { useLibraryBoardAction } from '~/features/library/model/useLibraryBoardAction'

interface RenameLibraryBoardTarget
{
  externalId: BoardId
  currentTitle: string
}

interface RenameLibraryBoardAction
{
  requestRename: (board: LibraryBoardListItem) => void
  cancelRename: () => void
  confirmRename: (nextTitle: string) => Promise<void>
  pendingExternalId: BoardId | null
  renameTarget: RenameLibraryBoardTarget | null
}

export const useRenameLibraryBoard = (): RenameLibraryBoardAction =>
{
  const [renameTarget, setRenameTarget] =
    useState<RenameLibraryBoardTarget | null>(null)
  const { run, pendingExternalId } = useLibraryBoardAction()

  const requestRename = useCallback((board: LibraryBoardListItem): void =>
  {
    setRenameTarget({
      externalId: asBoardId(board.externalId),
      currentTitle: board.title,
    })
  }, [])

  const cancelRename = useCallback((): void =>
  {
    setRenameTarget(null)
  }, [])

  const confirmRename = useCallback(
    async (nextTitle: string): Promise<void> =>
    {
      if (!renameTarget) return
      const trimmed = nextTitle.trim()
      if (!trimmed || trimmed === renameTarget.currentTitle)
      {
        setRenameTarget(null)
        return
      }

      const target = renameTarget
      setRenameTarget(null)

      await run(
        target.externalId,
        {
          errorMessage: 'Failed to rename board. Please try again.',
          logTag: 'Rename library board failed',
        },
        async () =>
        {
          const result = renameBoardSession(target.externalId, trimmed)
          if (!result.ok)
          {
            throw new Error(result.message)
          }
          toast(`Renamed to "${trimmed}".`, 'success')
        }
      )
    },
    [renameTarget, run]
  )

  return {
    requestRename,
    cancelRename,
    confirmRename,
    pendingExternalId,
    renameTarget,
  }
}
