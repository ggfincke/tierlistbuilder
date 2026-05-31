// src/features/marketplace/model/remix/useRemixConsensus.ts
// remix consensus flow: auth gate -> server clone -> local activation -> home

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { useRemixTemplateConsensusMutation } from '~/features/marketplace/data/rankingsRepository'
import { importCloudBoardAsActive } from '~/features/workspace/boards/model/cloudBoardActivation'
import {
  useSignedInMarketplaceAction,
  useVoidRun,
} from '~/features/marketplace/model/actions/useMarketplaceAsyncAction'
import { toast } from '~/shared/notifications/useToastStore'

interface RemixConsensusInput
{
  templateSlug: string
  templateTitle: string
  criterionExternalId: string
}

interface RemixConsensusAction
{
  run: (input: RemixConsensusInput) => Promise<void>
  isPending: boolean
}

export const useRemixConsensus = (): RemixConsensusAction =>
{
  const navigate = useNavigate()
  const remix = useRemixTemplateConsensusMutation()

  const remixConsensus = useCallback(
    async (input: RemixConsensusInput): Promise<void> =>
    {
      const result = await remix({
        templateSlug: input.templateSlug,
        criterionExternalId: input.criterionExternalId,
      })
      await importCloudBoardAsActive(result.boardExternalId)
      toast(
        `Remixed the consensus for "${input.templateTitle}" into a new board`,
        'success'
      )
      navigate('/')
    },
    [navigate, remix]
  )

  const { run: runRemix, isPending } = useSignedInMarketplaceAction<
    [RemixConsensusInput],
    void
  >('remixConsensus failed', remixConsensus, {
    promptOnSignedOut: true,
  })

  const run = useVoidRun(runRemix)

  return { run, isPending }
}
