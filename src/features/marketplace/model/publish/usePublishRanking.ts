// src/features/marketplace/model/publish/usePublishRanking.ts
// orchestrates the publish-ranking-from-board flow — server publish mutation,
// success toast, & redirect to the new ranking page

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import type { RankingVisibility } from '@tierlistbuilder/contracts/marketplace/ranking'
import { usePublishRankingFromBoardMutation } from '~/features/marketplace/data/rankingsRepository'
import { useSignedInMarketplaceAction } from '~/features/marketplace/model/actions/useMarketplaceAsyncAction'
import { RANKINGS_ROUTE_PATH } from '~/shared/routes/pathname'
import { toast } from '~/shared/notifications/useToastStore'

interface PublishRankingInput
{
  boardExternalId: string
  title: string
  description: string | null
  visibility: RankingVisibility
  // criterion lane this ranking answers; omit to publish into the template's
  // active primary criterion server-side
  criterionExternalId?: string
}

interface PublishRankingAction
{
  run: (input: PublishRankingInput) => Promise<{ slug: string } | null>
  isPending: boolean
  error: string | null
}

export const usePublishRanking = (): PublishRankingAction =>
{
  const publishMutation = usePublishRankingFromBoardMutation()
  const navigate = useNavigate()

  const publish = useCallback(
    async (input: PublishRankingInput): Promise<{ slug: string }> =>
    {
      const result = await publishMutation({
        boardExternalId: input.boardExternalId,
        title: input.title,
        description: input.description,
        visibility: input.visibility,
        ...(input.criterionExternalId
          ? { criterionExternalId: input.criterionExternalId }
          : {}),
      })
      toast(`Published "${input.title}"`, 'success')
      navigate(`${RANKINGS_ROUTE_PATH}/${result.slug}`)
      return { slug: result.slug }
    },
    [navigate, publishMutation]
  )

  const { run, isPending, error } = useSignedInMarketplaceAction<
    [PublishRankingInput],
    { slug: string }
  >('publishRankingFromBoard failed', publish, {
    signedOutError: 'Sign in to publish a ranking.',
  })

  return { run, isPending, error }
}
