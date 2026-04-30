// src/features/marketplace/model/usePublishTemplate.ts
// orchestrates the publish-from-board flow — optional cover upload, server
// publish mutation, success toast, & redirect to the new template page

import { useCallback, useState } from 'react'
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

export interface PublishTemplateInput extends Omit<
  PublishFromBoardArgs,
  'coverMediaExternalId'
>
{
  coverFile: File | null
  // pass true when the user explicitly cleared a previously-set cover so the
  // server-side first-item-media fallback gets bypassed in favor of null
  clearCover: boolean
}

export interface PublishTemplateAction
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
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async (input: PublishTemplateInput) =>
    {
      if (session.status !== 'signed-in')
      {
        setError('Sign in to publish a template.')
        return null
      }
      if (isPending) return null

      setIsPending(true)
      setError(null)
      try
      {
        let coverMediaExternalId: string | null = null
        if (input.coverFile)
        {
          const { externalId } = await uploadCoverImage(input.coverFile)
          coverMediaExternalId = externalId
        }
        else if (input.clearCover)
        {
          coverMediaExternalId = null
        }

        const { slug } = await publishMutation({
          boardExternalId: input.boardExternalId,
          title: input.title,
          description: input.description,
          category: input.category,
          tags: input.tags,
          visibility: input.visibility,
          creditLine: input.creditLine,
          coverMediaExternalId,
        })

        toast(`Published "${input.title}"`, 'success')
        navigate(`${TEMPLATES_ROUTE_PATH}/${slug}`)
        return { slug }
      }
      catch (caught)
      {
        logger.error('marketplace', 'publishFromBoard failed', caught)
        const message = formatMarketplaceError(caught)
        setError(message)
        toast(message, 'error')
        return null
      }
      finally
      {
        setIsPending(false)
      }
    },
    [isPending, navigate, publishMutation, session]
  )

  return { run, isPending, error }
}
