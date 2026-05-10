// src/features/marketplace/model/useUseTemplate.ts
// orchestrates the "Use this template" flow — auth gate -> server clone ->
// pull cloned board into local registry -> set active -> navigate to /

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { useUseTemplateMutation } from '~/features/marketplace/data/templatesRepository'
import { importCloudBoardAsActive } from '~/features/workspace/boards/model/cloudBoardActivation'
import { promptSignIn } from '~/features/platform/auth/model/useSignInPromptStore'
import { formatMarketplaceError } from '~/features/marketplace/model/formatters'
import { toast } from '~/shared/notifications/useToastStore'
import { logger } from '~/shared/lib/logger'
import { BOARDS_ROUTE_PATH } from '~/shared/routes/pathname'
import { useAsyncAction } from '~/shared/hooks/useAsyncAction'

interface UseTemplateOptions
{
  // criterion the user was looking at when they forked. server validates &
  // discards if it doesn't match an active lane on the source template
  preferredCriterionExternalId?: string
}

interface UseTemplateAction
{
  run: (
    slug: string,
    templateTitle: string,
    options?: UseTemplateOptions
  ) => Promise<void>
  isPending: boolean
}

export const useUseTemplate = (): UseTemplateAction =>
{
  const session = useAuthSession()
  const navigate = useNavigate()
  const cloneTemplate = useUseTemplateMutation()

  const useTemplate = useCallback(
    async (
      slug: string,
      templateTitle: string,
      options?: UseTemplateOptions
    ): Promise<void> =>
    {
      const preferredCriterionExternalId = options?.preferredCriterionExternalId
      const result = await cloneTemplate(
        preferredCriterionExternalId
          ? { slug, preferredCriterionExternalId }
          : { slug }
      )
      if (result.status === 'jobQueued')
      {
        toast(`Forking "${templateTitle}"`, 'success')
        navigate(BOARDS_ROUTE_PATH)
        return
      }

      await importCloudBoardAsActive(result.boardExternalId)
      toast(`Forked "${templateTitle}" into a new board`, 'success')
      navigate('/')
    },
    [cloneTemplate, navigate]
  )

  const onError = useCallback((error: unknown) =>
  {
    logger.error('marketplace', 'useTemplate failed', error)
    toast(formatMarketplaceError(error), 'error')
  }, [])

  const { run: runUseTemplate, isPending } = useAsyncAction<
    [string, string, UseTemplateOptions | undefined],
    void
  >(useTemplate, {
    onError,
  })

  const run = useCallback(
    async (
      slug: string,
      templateTitle: string,
      options?: UseTemplateOptions
    ) =>
    {
      if (session.status !== 'signed-in')
      {
        promptSignIn()
        return
      }
      await runUseTemplate(slug, templateTitle, options)
    },
    [runUseTemplate, session.status]
  )

  return { run, isPending }
}
