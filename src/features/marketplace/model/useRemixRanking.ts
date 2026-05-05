// src/features/marketplace/model/useRemixRanking.ts
// orchestrates the "Remix ranking" flow — auth gate -> server snapshot copy
// -> pull cloned board into local registry -> set active -> navigate to /

import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { useRemixRankingMutation } from '~/features/marketplace/data/rankingsRepository'
import { importCloudBoardAsActive } from '~/features/workspace/boards/model/cloudBoardActivation'
import { promptSignIn } from '~/features/platform/auth/model/useSignInPromptStore'
import { formatMarketplaceError } from '~/features/marketplace/model/formatters'
import { toast } from '~/shared/notifications/useToastStore'
import { logger } from '~/shared/lib/logger'

interface RemixRankingAction
{
  run: (slug: string, rankingTitle: string) => Promise<void>
  isPending: boolean
}

export const useRemixRanking = (): RemixRankingAction =>
{
  const session = useAuthSession()
  const navigate = useNavigate()
  const remix = useRemixRankingMutation()
  const [isPending, setIsPending] = useState(false)

  const run = useCallback(
    async (slug: string, rankingTitle: string) =>
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
        const result = await remix({ slug })
        await importCloudBoardAsActive(result.boardExternalId)
        toast(`Remixed "${rankingTitle}" into a new board`, 'success')
        navigate('/')
      }
      catch (error)
      {
        logger.error('marketplace', 'remixRanking failed', error)
        toast(formatMarketplaceError(error), 'error')
      }
      finally
      {
        setIsPending(false)
      }
    },
    [isPending, navigate, remix, session.status]
  )

  return { run, isPending }
}
