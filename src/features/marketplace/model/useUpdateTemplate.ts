// src/features/marketplace/model/useUpdateTemplate.ts
// orchestrates the template-edit flow — optional cover replacement, server
// metadata patch, success toast, & callback so callers can refresh

import { useCallback } from 'react'

import type { TemplateCoverFraming } from '@tierlistbuilder/contracts/marketplace/template'
import { uploadCoverImage } from '~/features/marketplace/data/coverImageUpload'
import {
  useUpdateMyTemplateMetaMutation,
  type UpdateMyTemplateMetaArgs,
} from '~/features/marketplace/data/templatesRepository'
import { formatMarketplaceError } from '~/features/marketplace/model/formatters'
import { toast } from '~/shared/notifications/useToastStore'
import { logger } from '~/shared/lib/logger'
import { useAsyncAction } from '~/shared/hooks/useAsyncAction'

interface UpdateTemplateInput extends Omit<
  UpdateMyTemplateMetaArgs,
  'coverMediaExternalId' | 'coverFraming'
>
{
  coverFile: File | null
  removeCover: boolean
  // undefined keeps the existing framing untouched on the server. pass null to
  // clear (cover removal already nulls it server-side); pass a value to set
  coverFraming?: TemplateCoverFraming | null
}

interface UpdateTemplateAction
{
  run: (input: UpdateTemplateInput) => Promise<{ slug: string } | null>
  isPending: boolean
  error: string | null
}

export const useUpdateTemplate = (): UpdateTemplateAction =>
{
  const updateMutation = useUpdateMyTemplateMetaMutation()

  const update = useCallback(
    async (input: UpdateTemplateInput): Promise<{ slug: string }> =>
    {
      let coverMediaExternalId: string | null | undefined
      if (input.coverFile)
      {
        const uploaded = await uploadCoverImage(input.coverFile)
        coverMediaExternalId = uploaded.externalId
      }
      else if (input.removeCover)
      {
        coverMediaExternalId = null
      }

      await updateMutation({
        slug: input.slug,
        title: input.title,
        description: input.description,
        category: input.category,
        tags: input.tags,
        visibility: input.visibility,
        creditLine: input.creditLine,
        coverMediaExternalId,
        coverFraming: input.coverFraming,
      })

      toast(`Saved "${input.title ?? input.slug}"`, 'success')
      return { slug: input.slug }
    },
    [updateMutation]
  )

  const onError = useCallback((caught: unknown) =>
  {
    logger.error('marketplace', 'updateMyTemplateMeta failed', caught)
    toast(formatMarketplaceError(caught), 'error')
  }, [])

  const { run, isPending, error } = useAsyncAction<
    [UpdateTemplateInput],
    { slug: string }
  >(update, {
    onError,
    getErrorMessage: formatMarketplaceError,
  })

  return { run, isPending, error }
}
