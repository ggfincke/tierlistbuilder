// src/features/library/model/useOpenBoard.ts
// opens a library board — routes to cloud activation when signed in, local
// session switch when signed out; both paths share pending-state semantics

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import type { LibraryBoardListItem } from '@tierlistbuilder/contracts/workspace/libraryBoard'

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { activateCloudBoardAsActive } from '~/features/workspace/boards/model/cloud/cloudBoardActivation'
import { switchBoardSession } from '~/features/workspace/boards/model/boardSession'
import { logger } from '~/shared/lib/logger'
import { toast } from '~/shared/notifications/useToastStore'
import { usePerKeyAsyncAction } from '~/shared/hooks/usePerKeyAsyncAction'

interface OpenBoardAction
{
  open: (board: LibraryBoardListItem) => void
  pendingBoardExternalId: string | null
}

export const useOpenBoard = (isSignedIn: boolean): OpenBoardAction =>
{
  const navigate = useNavigate()

  const handleError = useCallback(
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
  const { run: runOpen, pendingKey } = usePerKeyAsyncAction<string>({
    onError: handleError,
  })

  const open = useCallback(
    (board: LibraryBoardListItem) =>
    {
      void runOpen(board.externalId, async () =>
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
      })
    },
    [isSignedIn, navigate, runOpen]
  )

  return { open, pendingBoardExternalId: pendingKey }
}
