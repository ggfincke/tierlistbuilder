// src/features/marketplace/model/usePublishTemplate.ts
// orchestrates the publish-from-board flow — optional cover upload, server
// publish mutation, success toast, & redirect to the new template page

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { uploadCoverImage } from '~/features/marketplace/data/coverImageUpload'
import {
  usePublishFromBoardMutation,
  type PublishFromBoardArgs,
} from '~/features/marketplace/data/templatesRepository'
import { formatMarketplaceError } from '~/features/marketplace/model/formatters'
import { TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'
import { toast } from '~/shared/notifications/useToastStore'
import { logger } from '~/shared/lib/logger'
import { useAsyncAction } from '~/shared/hooks/useAsyncAction'

interface PublishTemplateInput extends Omit<
  PublishFromBoardArgs,
  'coverMediaExternalId'
>
{
  coverFile: File | null
}

interface PublishTemplateAction
{
  run: (input: PublishTemplateInput) => Promise<{ slug: string } | null>
  isPending: boolean
  error: string | null
}

export const usePublishTemplate = (): PublishTemplateAction =>
{
  const session = useAuthSession()
  const publishMutation = usePublishFromBoardMutation()
  const navigate = useNavigate()

  const publish = useCallback(
    async (input: PublishTemplateInput): Promise<{ slug: string }> =>
    {
      let coverMediaExternalId: string | undefined
      if (input.coverFile)
      {
        const { externalId } = await uploadCoverImage(input.coverFile)
        coverMediaExternalId = externalId
      }

      const result = await publishMutation({
        boardExternalId: input.boardExternalId,
        title: input.title,
        description: input.description,
        category: input.category,
        tags: input.tags,
        visibility: input.visibility,
        creditLine: input.creditLine,
        coverMediaExternalId,
        coverFraming: coverMediaExternalId ? input.coverFraming : null,
      })

      if (result.status === 'jobQueued')
      {
        toast(`Publishing "${input.title}"`, 'success')
        return { slug: result.slug }
      }

      toast(`Published "${input.title}"`, 'success')
      navigate(`${TEMPLATES_ROUTE_PATH}/${result.slug}`)
      return { slug: result.slug }
    },
    [navigate, publishMutation]
  )

  const onError = useCallback((caught: unknown) =>
  {
    logger.error('marketplace', 'publishFromBoard failed', caught)
    toast(formatMarketplaceError(caught), 'error')
  }, [])

  const {
    run: runPublish,
    isPending,
    error,
    setError,
  } = useAsyncAction<[PublishTemplateInput], { slug: string }>(publish, {
    onError,
    getErrorMessage: formatMarketplaceError,
  })

  const run = useCallback(
    async (input: PublishTemplateInput) =>
    {
      if (session.status !== 'signed-in')
      {
        setError('Sign in to publish a template.')
        return null
      }
      return await runPublish(input)
    },
    [runPublish, session.status, setError]
  )

  return { run, isPending, error }
}
