// src/features/marketplace/model/useRemixConsensus.ts
// remix consensus flow: auth gate -> server clone -> local activation -> home

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { useRemixTemplateConsensusMutation } from '~/features/marketplace/data/rankingsRepository'
import { importCloudBoardAsActive } from '~/features/workspace/boards/model/cloudBoardActivation'
import { promptSignIn } from '~/features/platform/auth/model/useSignInPromptStore'
import { formatMarketplaceError } from '~/features/marketplace/model/formatters'
import { toast } from '~/shared/notifications/useToastStore'
import { logger } from '~/shared/lib/logger'
import { useAsyncAction } from '~/shared/hooks/useAsyncAction'

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
  const session = useAuthSession()
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

  const onError = useCallback((error: unknown) =>
  {
    logger.error('marketplace', 'remixConsensus failed', error)
    toast(formatMarketplaceError(error), 'error')
  }, [])

  const { run: runRemix, isPending } = useAsyncAction<
    [RemixConsensusInput],
    void
  >(remixConsensus, {
    onError,
  })

  const run = useCallback(
    async (input: RemixConsensusInput) =>
    {
      if (session.status !== 'signed-in')
      {
        promptSignIn()
        return
      }
      await runRemix(input)
    },
    [runRemix, session.status]
  )

  return { run, isPending }
}
