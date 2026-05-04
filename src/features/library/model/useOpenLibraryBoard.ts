// src/features/library/model/useOpenLibraryBoard.ts
// activates a library board in the workspace registry & navigates to /

import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { LibraryBoardListItem } from '@tierlistbuilder/contracts/workspace/board'
import { activateCloudBoardAsActive } from '~/features/workspace/boards/model/cloudBoardActivation'
import { logger } from '~/shared/lib/logger'
import { toast } from '~/shared/notifications/useToastStore'

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
  // ref-mirror the pending id so the open callback stays referentially stable
  // & memoized BoardCard rows don't re-render on every other card's state flip
  const pendingRef = useRef<string | null>(null)
  pendingRef.current = pendingBoardExternalId

  const open = useCallback(
    (board: LibraryBoardListItem) =>
    {
      if (pendingRef.current) return
      setPendingBoardExternalId(board.externalId)
      void (async () =>
      {
        try
        {
          await activateCloudBoardAsActive(board.externalId)
          toast(`Opened "${board.title}"`, 'success')
          navigate('/')
        }
        catch (error)
        {
          logger.error('library', 'open library board failed', error)
          toast('Could not open that board. Please try again.', 'error')
        }
        finally
        {
          setPendingBoardExternalId(null)
        }
      })()
    },
    [navigate]
  )

  return { open, pendingBoardExternalId }
}
