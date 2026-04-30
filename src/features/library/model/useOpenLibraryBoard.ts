// src/features/library/model/useOpenLibraryBoard.ts
// activates a library board in the workspace registry & navigates to /

import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { LibraryBoardListItem } from '@tierlistbuilder/contracts/workspace/board'
import { activateTemplateBoardAsActive } from '~/features/marketplace/data/templateBoardImport'
import { formatMarketplaceError } from '~/features/marketplace/model/formatters'
import { logger } from '~/shared/lib/logger'
import { toast } from '~/shared/notifications/useToastStore'

export interface OpenLibraryBoardAction
{
  open: (board: LibraryBoardListItem) => Promise<void>
  pendingBoardExternalId: string | null
}

export const useOpenLibraryBoard = (): OpenLibraryBoardAction =>
{
  const navigate = useNavigate()
  const [pendingBoardExternalId, setPendingBoardExternalId] = useState<
    string | null
  >(null)

  const open = useCallback(
    async (board: LibraryBoardListItem) =>
    {
      if (pendingBoardExternalId) return

      setPendingBoardExternalId(board.externalId)
      try
      {
        await activateTemplateBoardAsActive(board.externalId)
        toast(`Opened "${board.title}"`, 'success')
        navigate('/')
      }
      catch (error)
      {
        logger.error('library', 'open library board failed', error)
        toast(
          formatMarketplaceError(
            error,
            'Could not open that board. Please try again.'
          ),
          'error'
        )
      }
      finally
      {
        setPendingBoardExternalId(null)
      }
    },
    [navigate, pendingBoardExternalId]
  )

  return { open, pendingBoardExternalId }
}
