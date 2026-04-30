// src/features/marketplace/model/useUseTemplate.ts
// orchestrates the "Use this template" flow — auth gate -> server clone ->
// pull cloned board into local registry -> set active -> navigate to /

import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { useUseTemplateMutation } from '~/features/marketplace/data/templatesRepository'
import { importCloudBoardAsActive } from '~/features/workspace/boards/model/cloudBoardActivation'
import { promptSignIn } from '~/features/platform/auth/model/useSignInPromptStore'
import { formatMarketplaceError } from '~/features/marketplace/model/formatters'
import { toast } from '~/shared/notifications/useToastStore'
import { logger } from '~/shared/lib/logger'

export interface UseTemplateAction
{
  run: (slug: string, templateTitle: string) => Promise<void>
  isPending: boolean
}

export const useUseTemplate = (): UseTemplateAction =>
{
  const session = useAuthSession()
  const navigate = useNavigate()
  const cloneTemplate = useUseTemplateMutation()
  const [isPending, setIsPending] = useState(false)

  const run = useCallback(
    async (slug: string, templateTitle: string) =>
    {
      if (session.status !== 'signed-in')
      {
        promptSignIn()
        return
      }
      if (isPending) return

      setIsPending(true)
      try
      {
        const { boardExternalId } = await cloneTemplate({ slug })
        await importCloudBoardAsActive(boardExternalId)
        toast(`Forked "${templateTitle}" into a new board`, 'success')
        navigate('/')
      }
      catch (error)
      {
        logger.error('marketplace', 'useTemplate failed', error)
        toast(formatMarketplaceError(error), 'error')
      }
      finally
      {
        setIsPending(false)
      }
    },
    [cloneTemplate, isPending, navigate, session.status]
  )

  return { run, isPending }
}
