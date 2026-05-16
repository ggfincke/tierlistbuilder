// src/features/library/model/useOpenBoard.ts
// opens a library board — routes to cloud activation when signed in, local
// session switch when signed out; both paths share pending-state semantics

import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { LibraryBoardListItem } from '@tierlistbuilder/contracts/workspace/board'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { activateCloudBoardAsActive } from '~/features/workspace/boards/model/cloudBoardActivation'
import { switchBoardSession } from '~/features/workspace/boards/model/boardSession'
import { logger } from '~/shared/lib/logger'
import { toast } from '~/shared/notifications/useToastStore'
import { useAsyncAction } from '~/shared/hooks/useAsyncAction'

interface OpenBoardAction
{
  open: (board: LibraryBoardListItem) => void
  pendingBoardExternalId: string | null
}

export const useOpenBoard = (isSignedIn: boolean): OpenBoardAction =>
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
        if (isSignedIn)
        {
          await activateCloudBoardAsActive(board.externalId)
          toast(`Opened "${board.title}"`, 'success')
        }
        else
        {
          // local rows carry the BoardId in externalId (see useLocalBoardsLibrary)
          await switchBoardSession(board.externalId as BoardId)
        }
        navigate('/')
      }
      finally
      {
        setPendingBoardExternalId(null)
      }
    },
    [isSignedIn, navigate]
  )

  const onError = useCallback(
    (error: unknown) =>
    {
      logger.error(
        'library',
        isSignedIn ? 'open library board failed' : 'open local board failed',
        error
      )
      toast('Could not open that board. Please try again.', 'error')
    },
    [isSignedIn]
  )

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
