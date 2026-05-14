// src/features/library/model/useOpenLocalBoard.ts
// opens a locally-persisted board from the signed-out My Boards grid —
// switches the active board session & navigates to the workspace

import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { LibraryBoardListItem } from '@tierlistbuilder/contracts/workspace/board'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { switchBoardSession } from '~/features/workspace/boards/model/boardSession'
import { logger } from '~/shared/lib/logger'
import { toast } from '~/shared/notifications/useToastStore'
import { useAsyncAction } from '~/shared/hooks/useAsyncAction'

interface OpenLocalBoardAction
{
  open: (board: LibraryBoardListItem) => void
  pendingBoardExternalId: string | null
}

export const useOpenLocalBoard = (): OpenLocalBoardAction =>
{
  const navigate = useNavigate()
  const [pendingBoardExternalId, setPendingBoardExternalId] = useState<
    string | null
  >(null)

  const openBoard = useCallback(
    async (board: LibraryBoardListItem): Promise<void> =>
    {
      setPendingBoardExternalId(board.externalId)
      try
      {
        // local rows carry the BoardId in externalId (see useLocalBoardsLibrary)
        await switchBoardSession(board.externalId as BoardId)
        navigate('/')
      }
      finally
      {
        setPendingBoardExternalId(null)
      }
    },
    [navigate]
  )

  const onError = useCallback((error: unknown) =>
  {
    logger.error('library', 'open local board failed', error)
    toast('Could not open that board. Please try again.', 'error')
  }, [])

  const { run: runOpen } = useAsyncAction<[LibraryBoardListItem], void>(
    openBoard,
    { onError }
  )

  const open = useCallback(
    (board: LibraryBoardListItem) =>
    {
      void runOpen(board)
    },
    [runOpen]
  )

  return { open, pendingBoardExternalId }
}
