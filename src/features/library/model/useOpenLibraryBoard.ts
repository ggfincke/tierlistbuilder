// src/features/library/model/useOpenLibraryBoard.ts
// activates a library board in the workspace registry & navigates to /

import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { LibraryBoardListItem } from '@tierlistbuilder/contracts/workspace/board'
import { activateCloudBoardAsActive } from '~/features/workspace/boards/model/cloudBoardActivation'
import { logger } from '~/shared/lib/logger'
import { toast } from '~/shared/notifications/useToastStore'
import { useAsyncAction } from '~/shared/hooks/useAsyncAction'

interface OpenLibraryBoardAction
{
  open: (board: LibraryBoardListItem) => void
  pendingBoardExternalId: string | null
}

export const useOpenLibraryBoard = (): OpenLibraryBoardAction =>
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
        await activateCloudBoardAsActive(board.externalId)
        toast(`Opened "${board.title}"`, 'success')
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
    logger.error('library', 'open library board failed', error)
    toast('Could not open that board. Please try again.', 'error')
  }, [])

  const { run: runOpen } = useAsyncAction<[LibraryBoardListItem], void>(
    openBoard,
    {
      onError,
    }
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
