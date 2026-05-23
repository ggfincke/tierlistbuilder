// src/features/marketplace/model/remix/useUseTemplate.ts
// orchestrates "Use this template" — local-first for standard templates;
// large templates fall back to the server-side queued clone (signed-in only)

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { getUserStableId } from '~/features/platform/auth/model/userIdentity'
import {
  getTemplateBySlugImperative,
  loadAllTemplateItemsImperative,
  useUseTemplateMutation,
} from '~/features/marketplace/data/templatesRepository'
import { importCloudBoardAsActive } from '~/features/workspace/boards/model/cloudBoardActivation'
import { createLocalBoardFromTemplate } from '~/features/workspace/boards/model/localBoardFork'
import { promptSignIn } from '~/features/platform/auth/model/useSignInPromptStore'
import {
  useMarketplaceAsyncAction,
  useVoidRun,
} from '~/features/marketplace/model/actions/useMarketplaceAsyncAction'
import { notifyLocalBoardForked } from '~/features/marketplace/model/remix/localBoardForkToast'
import { toast } from '~/shared/notifications/useToastStore'
import { BOARDS_ROUTE_PATH } from '~/shared/routes/pathname'

interface UseTemplateOptions
{
  // criterion the user was looking at when they forked. server validates &
  // discards if it doesn't match an active lane on the source template
  preferredCriterionExternalId?: string
}

interface UseTemplateAction
{
  run: (
    slug: string,
    templateTitle: string,
    options?: UseTemplateOptions
  ) => Promise<void>
  isPending: boolean
}

// large templates exceed the single-transaction sync cap (200 items) — the
// server's queueLargeTemplateClone owns this path so they don't fit a
// pure-client local-first flow
const requiresServerQueuedClone = (sizeClass: 'standard' | 'large'): boolean =>
  sizeClass === 'large'

export const useUseTemplate = (): UseTemplateAction =>
{
  const session = useAuthSession()
  const navigate = useNavigate()
  const cloneTemplate = useUseTemplateMutation()
  const syncOwnerUserId =
    session.status === 'signed-in' ? getUserStableId(session.user) : null
  const signedIn = syncOwnerUserId !== null

  const useTemplate = useCallback(
    async (
      slug: string,
      templateTitle: string,
      options?: UseTemplateOptions
    ): Promise<void> =>
    {
      const detail = await getTemplateBySlugImperative(slug)
      if (!detail)
      {
        toast('That template is no longer available.', 'error')
        return
      }

      // large templates: queued server-side clone. signed-out viewers can't
      // fork these locally (storage budget) so we route to a sign-in prompt
      if (requiresServerQueuedClone(detail.sizeClass))
      {
        if (!signedIn)
        {
          toast(
            `Sign in to fork "${templateTitle}" — large templates only sync to the cloud.`,
            'info'
          )
          promptSignIn()
          return
        }

        const preferredCriterionExternalId =
          options?.preferredCriterionExternalId
        const result = await cloneTemplate(
          preferredCriterionExternalId
            ? { slug, preferredCriterionExternalId }
            : { slug }
        )
        if (result.status === 'jobQueued')
        {
          toast(`Forking "${templateTitle}"…`, 'success')
          navigate(BOARDS_ROUTE_PATH)
          return
        }
        await importCloudBoardAsActive(result.boardExternalId)
        toast(`Forked "${templateTitle}" into a new board`, 'success')
        navigate('/')
        return
      }

      // standard templates: unified client-side local creation. signed-in
      // viewers' sync subscriber picks the new board up immediately & ticks
      // the fork counter via upsertBoardState's first-sync trigger
      const templateItems = await loadAllTemplateItemsImperative(slug)
      await createLocalBoardFromTemplate({
        template: detail,
        templateItems,
        title: templateTitle,
        markPendingSync: signedIn,
        pendingSyncOwnerUserId: syncOwnerUserId,
        preferredCriterionExternalId: options?.preferredCriterionExternalId,
      })

      notifyLocalBoardForked({
        verb: 'Forked',
        title: templateTitle,
        signedIn,
      })
      navigate('/')
    },
    [cloneTemplate, navigate, signedIn, syncOwnerUserId]
  )

  const { run: runUseTemplate, isPending } = useMarketplaceAsyncAction<
    [string, string, UseTemplateOptions | undefined],
    void
  >('useTemplate failed', useTemplate)

  const run = useVoidRun(runUseTemplate)

  return { run, isPending }
}
