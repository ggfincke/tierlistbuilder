// src/features/marketplace/model/useRemixRanking.ts
// orchestrates the "Remix ranking" flow — signed-out & signed-in both build a
// local board first, composing the ranking snapshot w/ the template item set

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { getRankingBySlugImperative } from '~/features/marketplace/data/rankingsRepository'
import { loadAllTemplateItemsImperative } from '~/features/marketplace/data/templatesRepository'
import { createLocalBoardFromRanking } from '~/features/workspace/boards/model/localBoardFork'
import { promptSignIn } from '~/features/platform/auth/model/useSignInPromptStore'
import { useMarketplaceAsyncAction } from '~/features/marketplace/model/useMarketplaceAsyncAction'
import { toast, toastWithAction } from '~/shared/notifications/useToastStore'

interface RemixRankingAction
{
  run: (slug: string, rankingTitle: string) => Promise<void>
  isPending: boolean
}

export const useRemixRanking = (): RemixRankingAction =>
{
  const session = useAuthSession()
  const navigate = useNavigate()

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

      const signedIn = session.status === 'signed-in'

      await createLocalBoardFromRanking({
        ranking,
        templateItems,
        title: rankingTitle,
        markPendingSync: signedIn,
      })

      if (signedIn)
      {
        toast(`Remixed "${rankingTitle}" into a new board`, 'success')
      }
      else
      {
        toastWithAction(
          `Remixed "${rankingTitle}" locally. Sign in to sync.`,
          { label: 'Sign in', onClick: promptSignIn },
          'info'
        )
      }
      navigate('/')
    },
    [navigate, session.status]
  )

  const { run: runRemix, isPending } = useMarketplaceAsyncAction<
    [string, string],
    void
  >('remixRanking failed', remixRanking)

  // collapse the action runner's Promise<void | null> back to Promise<void>;
  // the null on error is captured by the action store, not relayed to callers
  const run = useCallback(
    async (slug: string, rankingTitle: string): Promise<void> =>
    {
      await runRemix(slug, rankingTitle)
    },
    [runRemix]
  )

  return { run, isPending }
}
