// src/features/library/model/useOpenBoard.ts
// opens a library board — switches the active session & routes to workspace

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { asBoardId, type BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { LibraryBoardListItem } from '@tierlistbuilder/contracts/workspace/board'
import { switchBoardSession } from '~/features/workspace/boards/model/boardSession'

import { useLibraryBoardAction } from './useLibraryBoardAction'

interface OpenBoardAction
{
  open: (board: LibraryBoardListItem) => void
  pendingBoardExternalId: BoardId | null
}

export const useOpenBoard = (): OpenBoardAction =>
{
  const navigate = useNavigate()
  const { run, pendingExternalId } = useLibraryBoardAction()

  const open = useCallback(
    (board: LibraryBoardListItem): void =>
    {
      const externalId = asBoardId(board.externalId)
      void run(
        externalId,
        {
          errorMessage: 'Could not open that board. Please try again.',
          logTag: 'Open library board failed',
        },
        async () =>
        {
          await switchBoardSession(externalId)
          navigate('/')
        }
      )
    },
    [navigate, run]
  )

  return { open, pendingBoardExternalId: pendingExternalId }
}
