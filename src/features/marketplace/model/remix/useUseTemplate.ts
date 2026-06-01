// src/features/marketplace/model/remix/useUseTemplate.ts
// orchestrates "Use this template" — local-first for standard templates;
// large templates fall back to the server-side queued clone (signed-in only)

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { useSyncOwnerUserId } from '~/features/platform/auth/model/useSyncOwnerUserId'
import {
  getTemplateBySlugImperative,
  loadAllTemplateItemsImperative,
  useUseTemplateMutation,
} from '~/features/marketplace/data/templatesRepository'
import { importCloudBoardAsActive } from '~/features/workspace/boards/model/cloud/cloudBoardActivation'
import { createLocalBoardFromTemplate } from '~/features/workspace/boards/model/localBoardFork'
import { promptSignIn } from '~/features/platform/auth/model/useSignInPromptStore'
import {
  useMarketplaceAsyncAction,
  useVoidRun,
} from '~/features/marketplace/model/actions/useMarketplaceAsyncAction'
import { runLocalFork } from '~/features/marketplace/model/remix/runLocalFork'
import { toast } from '~/shared/notifications/useToastStore'
import { BOARDS_ROUTE_PATH } from '~/shared/routes/pathname'

interface UseTemplateOptions
{
  // criterion the user was looking at when they forked. server validates &
  // discards if it doesn't match an active lane on the source template
  preferredCriterionExternalId?: string
  // chosen image style (skin) externalId; server validates against the source
  // template's styles & falls back to the default
  styleId?: string
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
  const navigate = useNavigate()
  const cloneTemplate = useUseTemplateMutation()
  const syncOwnerUserId = useSyncOwnerUserId()
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

      // a non-default skin pools server-resident image data, so it resolves
      // through the authoritative server fork rather than the local-first path
      const isNonDefaultStyleSelected =
        !!options?.styleId &&
        detail.styleOptions.some(
          (style) => style.externalId === options.styleId && !style.isDefault
        )

      // large templates: queued server-side clone. signed-out viewers can't
      // fork these locally (storage budget) so we route to a sign-in prompt.
      // non-default skins take the same server path for correct image data
      if (
        requiresServerQueuedClone(detail.sizeClass) ||
        isNonDefaultStyleSelected
      )
      {
        if (!signedIn)
        {
          const reason = requiresServerQueuedClone(detail.sizeClass)
            ? 'large templates only sync to the cloud'
            : 'custom image styles sync to the cloud'
          toast(`Sign in to fork "${templateTitle}" — ${reason}.`, 'info')
          promptSignIn()
          return
        }

        const preferredCriterionExternalId =
          options?.preferredCriterionExternalId
        const result = await cloneTemplate({
          slug,
          ...(preferredCriterionExternalId
            ? { preferredCriterionExternalId }
            : {}),
          ...(options?.styleId ? { styleId: options.styleId } : {}),
        })
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
      await runLocalFork({
        verb: 'Forked',
        title: templateTitle,
        signedIn,
        navigate,
        fork: () =>
          createLocalBoardFromTemplate({
            template: detail,
            templateItems,
            title: templateTitle,
            markPendingSync: signedIn,
            pendingSyncOwnerUserId: syncOwnerUserId,
            preferredCriterionExternalId: options?.preferredCriterionExternalId,
          }),
      })
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
