// src/features/marketplace/model/publish/usePublishTemplate.ts
// orchestrates the publish-from-board flow — optional cover upload, server
// publish mutation, success toast, & redirect to the new template page

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { uploadCoverImage } from '~/features/marketplace/data/coverImageUpload'
import {
  usePublishFromBoardMutation,
  type PublishFromBoardArgs,
} from '~/features/marketplace/data/templatesRepository'
import { useSignedInMarketplaceAction } from '~/features/marketplace/model/actions/useMarketplaceAsyncAction'
import { TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'
import { toast } from '~/shared/notifications/useToastStore'

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

  const { run, isPending, error } = useSignedInMarketplaceAction<
    [PublishTemplateInput],
    { slug: string }
  >('publishFromBoard failed', publish, {
    signedOutError: 'Sign in to publish a template.',
  })

  return { run, isPending, error }
}
