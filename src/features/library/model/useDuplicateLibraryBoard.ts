// src/features/library/model/useDuplicateLibraryBoard.ts
// duplicate driver for library rows — pulls cloud-only boards into the local
// registry first so duplicateBoardSession has a snapshot to copy from

import { useCallback } from 'react'

import { asBoardId, type BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { LibraryBoardListItem } from '@tierlistbuilder/contracts/workspace/board'
import { activateCloudBoardAsActive } from '~/features/workspace/boards/model/cloud/cloudBoardActivation'
import { duplicateBoardSession } from '~/features/workspace/boards/model/boardSession'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { useSyncOwnerUserId } from '~/features/platform/auth/model/useSyncOwnerUserId'
import { toast } from '~/shared/notifications/useToastStore'

import { useLibraryBoardAction } from './useLibraryBoardAction'

interface DuplicateLibraryBoardAction
{
  duplicate: (board: LibraryBoardListItem) => Promise<void>
  pendingExternalId: BoardId | null
}

export const useDuplicateLibraryBoard = (): DuplicateLibraryBoardAction =>
{
  const { run, pendingExternalId } = useLibraryBoardAction()
  const pendingSyncOwnerUserId = useSyncOwnerUserId()

  const duplicate = useCallback(
    async (board: LibraryBoardListItem): Promise<void> =>
    {
      const externalId = asBoardId(board.externalId)
      await run(
        externalId,
        {
          errorMessage: 'Failed to duplicate board. Please try again.',
          logTag: 'Duplicate library board failed',
        },
        async () =>
        {
          const inRegistry = useWorkspaceBoardRegistryStore
            .getState()
            .isBoardInRegistry(externalId)

          // duplicateBoardSession reads the snapshot via the registry & the
          // copy ends up active anyway, so activating here is fine
          if (!inRegistry)
          {
            await activateCloudBoardAsActive(board.externalId)
          }
          await duplicateBoardSession(externalId, { pendingSyncOwnerUserId })
          toast(`Duplicated "${board.title}".`, 'success')
        }
      )
    },
    [pendingSyncOwnerUserId, run]
  )

  return { duplicate, pendingExternalId }
}
