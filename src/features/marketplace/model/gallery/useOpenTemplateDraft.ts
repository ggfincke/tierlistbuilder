// src/features/marketplace/model/gallery/useOpenTemplateDraft.ts
// opens an in-progress template-derived board from the marketplace rail

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import type { MarketplaceTemplateDraft } from '@tierlistbuilder/contracts/marketplace/template'
import { activateCloudBoardAsActive } from '~/features/workspace/boards/model/cloudBoardActivation'
import { formatMarketplaceError } from '~/features/marketplace/model/formatters'
import { logger } from '~/shared/lib/logger'
import { toast } from '~/shared/notifications/useToastStore'
import { usePerKeyAsyncAction } from '~/shared/hooks/usePerKeyAsyncAction'

interface OpenTemplateDraftAction
{
  open: (draft: MarketplaceTemplateDraft) => Promise<void>
  pendingBoardExternalId: string | null
}

export const useOpenTemplateDraft = (): OpenTemplateDraftAction =>
{
  const navigate = useNavigate()

  const onError = useCallback((error: unknown) =>
  {
    logger.error('marketplace', 'open template draft failed', error)
    toast(
      formatMarketplaceError(
        error,
        'Could not open that board. Please try again.'
      ),
      'error'
    )
  }, [])
  const { run: runOpen, pendingKey } = usePerKeyAsyncAction<string>({
    onError,
  })

  const open = useCallback(
    async (draft: MarketplaceTemplateDraft) =>
    {
      await runOpen(draft.boardExternalId, async () =>
      {
        await activateCloudBoardAsActive(draft.boardExternalId)
        toast(`Opened "${draft.boardTitle}"`, 'success')
        navigate('/')
      })
    },
    [navigate, runOpen]
  )

  return { open, pendingBoardExternalId: pendingKey }
}
