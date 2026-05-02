// src/features/marketplace/model/useOpenTemplateDraft.ts
// handle template-draft clicks for the frontend-only gallery

import { useCallback, useState } from 'react'

import type { MarketplaceTemplateDraft } from '@tierlistbuilder/contracts/marketplace/template'
import { toast } from '~/shared/notifications/useToastStore'

interface OpenTemplateDraftAction
{
  open: (draft: MarketplaceTemplateDraft) => Promise<void>
  pendingBoardExternalId: string | null
}

export const useOpenTemplateDraft = (): OpenTemplateDraftAction =>
{
  const [pendingBoardExternalId, setPendingBoardExternalId] = useState<
    string | null
  >(null)

  const open = useCallback(
    async (draft: MarketplaceTemplateDraft) =>
    {
      if (pendingBoardExternalId) return

      setPendingBoardExternalId(draft.boardExternalId)
      toast(`"${draft.boardTitle}" is not available in this build.`, 'info')
      setPendingBoardExternalId(null)
    },
    [pendingBoardExternalId]
  )

  return { open, pendingBoardExternalId }
}
