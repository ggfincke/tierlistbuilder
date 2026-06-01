// src/features/library/model/useRenameLibraryBoard.ts
// rename driver for library rows — pulls cloud-only boards into the local
// registry so renameBoardSession's patch lands & rides the sync drain

import { useCallback, useState } from 'react'

import { asBoardId, type BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { LibraryBoardListItem } from '@tierlistbuilder/contracts/workspace/libraryBoard'

import { materializeCloudBoardInBackground } from '~/features/workspace/boards/model/cloud/cloudBoardActivation'
import { renameBoardSession } from '~/features/workspace/boards/model/boardSession'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { toast } from '~/shared/notifications/useToastStore'

import { useLibraryBoardAction } from './useLibraryBoardAction'

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
          const inRegistry = useWorkspaceBoardRegistryStore
            .getState()
            .isBoardInRegistry(target.externalId)

          // cloud-only rows need a local shell so renameBoardSession can
          // patch the registry; materializing in the background avoids
          // swapping the user's currently-open board
          if (!inRegistry)
          {
            await materializeCloudBoardInBackground(target.externalId)
          }
          renameBoardSession(target.externalId, trimmed)
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
