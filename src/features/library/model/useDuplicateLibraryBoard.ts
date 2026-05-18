// src/features/library/model/useDuplicateLibraryBoard.ts
// duplicate driver for library rows — copies via duplicateBoardSession

import { useCallback } from 'react'

import { asBoardId, type BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { LibraryBoardListItem } from '@tierlistbuilder/contracts/workspace/board'
import { duplicateBoardSession } from '~/features/workspace/boards/model/boardSession'
import { toast } from '~/shared/notifications/useToastStore'

import { useLibraryBoardAction } from '~/features/library/model/useLibraryBoardAction'

interface DuplicateLibraryBoardAction
{
  duplicate: (board: LibraryBoardListItem) => Promise<void>
  pendingExternalId: BoardId | null
}

export const useDuplicateLibraryBoard = (): DuplicateLibraryBoardAction =>
{
  const { run, pendingExternalId } = useLibraryBoardAction()

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
          await duplicateBoardSession(externalId)
          toast(`Duplicated "${board.title}".`, 'success')
        }
      )
    },
    [run]
  )

  return { duplicate, pendingExternalId }
}
