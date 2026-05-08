// src/features/marketplace/model/usePublishRanking.ts
// orchestrates the publish-ranking-from-board flow — server publish mutation,
// success toast, & redirect to the new ranking page

import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { RankingVisibility } from '@tierlistbuilder/contracts/marketplace/ranking'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { usePublishRankingFromBoardMutation } from '~/features/marketplace/data/rankingsRepository'
import { formatMarketplaceError } from '~/features/marketplace/model/formatters'
import { RANKINGS_ROUTE_PATH } from '~/shared/routes/pathname'
import { toast } from '~/shared/notifications/useToastStore'
import { logger } from '~/shared/lib/logger'

interface PublishRankingInput
{
  boardExternalId: string
  title: string
  description: string | null
  visibility: RankingVisibility
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
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async (input: PublishRankingInput) =>
    {
      if (session.status !== 'signed-in')
      {
        setError('Sign in to publish a ranking.')
        return null
      }
      if (isPending) return null

      setIsPending(true)
      setError(null)
      try
      {
        const result = await publishMutation({
          boardExternalId: input.boardExternalId,
          title: input.title,
          description: input.description,
          visibility: input.visibility,
        })
        toast(`Published "${input.title}"`, 'success')
        navigate(`${RANKINGS_ROUTE_PATH}/${result.slug}`)
        return { slug: result.slug }
      }
      catch (caught)
      {
        logger.error('marketplace', 'publishRankingFromBoard failed', caught)
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
