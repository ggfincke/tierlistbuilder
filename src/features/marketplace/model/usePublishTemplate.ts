// src/features/marketplace/model/usePublishTemplate.ts
// orchestrate the frontend-only publish-from-board flow

import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  usePublishFromBoardMutation,
  type PublishFromBoardArgs,
} from '~/features/marketplace/data/templatesRepository'
import { formatMarketplaceError } from '~/features/marketplace/model/formatters'
import { TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'
import { toast } from '~/shared/notifications/useToastStore'
import { logger } from '~/shared/lib/logger'

interface PublishTemplateInput extends Omit<
  PublishFromBoardArgs,
  'coverMediaExternalId'
>
{
  coverFile: File | null
  clearCover: boolean
}

interface PublishTemplateAction
{
  run: (input: PublishTemplateInput) => Promise<{ slug: string } | null>
  isPending: boolean
  error: string | null
}

export const usePublishTemplate = (): PublishTemplateAction =>
{
  const publishMutation = usePublishFromBoardMutation()
  const navigate = useNavigate()
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async (input: PublishTemplateInput) =>
    {
      if (isPending) return null

      setIsPending(true)
      setError(null)
      try
      {
        const result = await publishMutation({
          boardExternalId: input.boardExternalId,
          title: input.title,
          description: input.description,
          category: input.category,
          tags: input.tags,
          visibility: input.visibility,
          creditLine: input.creditLine,
          coverMediaExternalId: null,
        })

        if (result.status === 'jobQueued')
        {
          toast(`Publishing "${input.title}"`, 'success')
          return { slug: result.slug }
        }

        toast(`Published "${input.title}"`, 'success')
        navigate(`${TEMPLATES_ROUTE_PATH}/${result.slug}`)
        return { slug: result.slug }
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
    [isPending, navigate, publishMutation]
  )

  return { run, isPending, error }
}
