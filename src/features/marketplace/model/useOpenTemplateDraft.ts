// src/features/marketplace/model/useOpenTemplateDraft.ts
// opens an in-progress template-derived board from the marketplace rail

import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { MarketplaceTemplateDraft } from '@tierlistbuilder/contracts/marketplace/template'
import { activateTemplateBoardAsActive } from '~/features/marketplace/data/templateBoardImport'
import { formatMarketplaceError } from '~/features/marketplace/model/formatters'
import { logger } from '~/shared/lib/logger'
import { toast } from '~/shared/notifications/useToastStore'

export interface OpenTemplateDraftAction
{
  open: (draft: MarketplaceTemplateDraft) => Promise<void>
  pendingBoardExternalId: string | null
}

export const useOpenTemplateDraft = (): OpenTemplateDraftAction =>
{
  const navigate = useNavigate()
  const [pendingBoardExternalId, setPendingBoardExternalId] = useState<
    string | null
  >(null)

  const open = useCallback(
    async (draft: MarketplaceTemplateDraft) =>
    {
      if (pendingBoardExternalId) return

      setPendingBoardExternalId(draft.boardExternalId)
      try
      {
        await activateTemplateBoardAsActive(draft.boardExternalId)
        toast(`Opened "${draft.boardTitle}"`, 'success')
        navigate('/')
      }
      catch (error)
      {
        logger.error('marketplace', 'open template draft failed', error)
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
