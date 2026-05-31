// src/features/marketplace/model/remix/useRemixRanking.ts
// orchestrates the "Remix ranking" flow — signed-out & signed-in both build a
// local board first, composing the ranking snapshot w/ the template item set

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { getRankingBySlugImperative } from '~/features/marketplace/data/rankingsRepository'
import { loadAllTemplateItemsImperative } from '~/features/marketplace/data/templatesRepository'
import { createLocalBoardFromRanking } from '~/features/workspace/boards/model/localBoardFork'
import {
  useMarketplaceAsyncAction,
  useVoidRun,
} from '~/features/marketplace/model/actions/useMarketplaceAsyncAction'
import { runLocalFork } from '~/features/marketplace/model/remix/runLocalFork'
import { toast } from '~/shared/notifications/useToastStore'

interface RemixRankingAction
{
  run: (slug: string, rankingTitle: string) => Promise<void>
  isPending: boolean
}

export const useRemixRanking = (): RemixRankingAction =>
{
  const navigate = useNavigate()
  const signedIn = false

  const remixRanking = useCallback(
    async (slug: string, rankingTitle: string): Promise<void> =>
    {
      const ranking = await getRankingBySlugImperative(slug)
      if (!ranking)
      {
        toast('That ranking is no longer available.', 'error')
        return
      }

      const templateItems = await loadAllTemplateItemsImperative(
        ranking.template.slug
      )

      await runLocalFork({
        verb: 'Remixed',
        title: rankingTitle,
        signedIn,
        navigate,
        fork: () =>
          createLocalBoardFromRanking({
            ranking,
            templateItems,
            title: rankingTitle,
            markPendingSync: signedIn,
          }),
      })
    },
    [navigate, signedIn]
  )

  const { run: runRemix, isPending } = useMarketplaceAsyncAction<
    [string, string],
    void
  >('remixRanking failed', remixRanking)

  const run = useVoidRun(runRemix)

  return { run, isPending }
}
