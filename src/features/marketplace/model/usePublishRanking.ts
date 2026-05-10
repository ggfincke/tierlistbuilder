// src/features/marketplace/model/usePublishRanking.ts
// orchestrates the publish-ranking-from-board flow — server publish mutation,
// success toast, & redirect to the new ranking page

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import type { RankingVisibility } from '@tierlistbuilder/contracts/marketplace/ranking'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { usePublishRankingFromBoardMutation } from '~/features/marketplace/data/rankingsRepository'
import { formatMarketplaceError } from '~/features/marketplace/model/formatters'
import { RANKINGS_ROUTE_PATH } from '~/shared/routes/pathname'
import { toast } from '~/shared/notifications/useToastStore'
import { logger } from '~/shared/lib/logger'
import { useAsyncAction } from '~/shared/hooks/useAsyncAction'

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
  const session = useAuthSession()
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

  const onError = useCallback((caught: unknown) =>
  {
    logger.error('marketplace', 'publishRankingFromBoard failed', caught)
    toast(formatMarketplaceError(caught), 'error')
  }, [])

  const {
    run: runPublish,
    isPending,
    error,
    setError,
  } = useAsyncAction<[PublishRankingInput], { slug: string }>(publish, {
    onError,
    getErrorMessage: formatMarketplaceError,
  })

  const run = useCallback(
    async (input: PublishRankingInput) =>
    {
      if (session.status !== 'signed-in')
      {
        setError('Sign in to publish a ranking.')
        return null
      }
      return await runPublish(input)
    },
    [runPublish, session.status, setError]
  )

  return { run, isPending, error }
}
