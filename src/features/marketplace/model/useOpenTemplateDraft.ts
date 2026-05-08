// src/features/marketplace/model/useOpenTemplateDraft.ts
// opens an in-progress template-derived board from the marketplace rail

import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { MarketplaceTemplateDraft } from '@tierlistbuilder/contracts/marketplace/template'
import { activateCloudBoardAsActive } from '~/features/workspace/boards/model/cloudBoardActivation'
import { formatMarketplaceError } from '~/features/marketplace/model/formatters'
import { logger } from '~/shared/lib/logger'
import { toast } from '~/shared/notifications/useToastStore'
import { useAsyncAction } from '~/shared/hooks/useAsyncAction'

interface OpenTemplateDraftAction
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

  const openDraft = useCallback(
    async (draft: MarketplaceTemplateDraft): Promise<void> =>
    {
      setPendingBoardExternalId(draft.boardExternalId)
      try
      {
        await activateCloudBoardAsActive(draft.boardExternalId)
        toast(`Opened "${draft.boardTitle}"`, 'success')
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
    logger.error('marketplace', 'open template draft failed', error)
    toast(
      formatMarketplaceError(
        error,
        'Could not open that board. Please try again.'
      ),
      'error'
    )
  }, [])

  const { run: runOpen } = useAsyncAction<[MarketplaceTemplateDraft], void>(
    openDraft,
    {
      onError,
    }
  )

  const open = useCallback(
    async (draft: MarketplaceTemplateDraft) =>
    {
      await runOpen(draft)
    },
    [runOpen]
  )

  return { open, pendingBoardExternalId }
}
