// src/app/bootstrap/useAppBootstrap.ts
// bootstrap hook — hydrate persisted stores, initialize board session, & register autosave

import { useEffect, useState } from 'react'

import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import {
  bootstrapBoardSession,
  importBoardSession,
  registerBoardAutosave,
} from '~/features/workspace/boards/data/local/localBoardSession'
import { clearShareFragment } from '~/features/workspace/sharing/lib/hashShare'
import { clearShortLinkSlugFromUrl } from '~/features/workspace/sharing/lib/shortLinkShare'
import { resolveInboundShare } from '~/features/workspace/sharing/lib/inboundShare'
import { toast } from '~/shared/notifications/useToastStore'

// import a shared board if the URL carries a share marker. scrubs the URL
// unconditionally so a refresh doesn't re-trigger the import; toasts only
// on slug failure (fragment failure is silent — tampering is the likely cause)
const handleInboundShare = async (): Promise<void> =>
{
  const result = await resolveInboundShare()

  try
  {
    if (result.kind === 'resolved')
    {
      await importBoardSession(result.data)
    }
    else if (result.kind === 'failed' && result.source === 'slug')
    {
      toast(
        'This share link is no longer available. It may have expired or been removed.',
        'info'
      )
    }
  }
  finally
  {
    clearShareFragment()
    clearShortLinkSlugFromUrl()
  }
}

const storesHydrated = () =>
  useSettingsStore.persist.hasHydrated() &&
  useWorkspaceBoardRegistryStore.persist.hasHydrated()

// module-level promise shared across StrictMode double-mount so the first &
// second effect both await the same run; a per-instance ref would let the
// second mount see "already started" & bail before setting ready
let bootstrapPromise: Promise<void> | null = null

const runBootstrapOnce = (): Promise<void> =>
{
  if (!bootstrapPromise)
  {
    bootstrapPromise = (async () =>
    {
      await bootstrapBoardSession()
      registerBoardAutosave()
      await handleInboundShare()
    })().catch((error) =>
    {
      // clear the cached promise on reject so a subsequent mount can
      // retry instead of awaiting a rejected promise forever (e.g. after
      // a transient quota error during bootstrapBoardSession)
      bootstrapPromise = null
      throw error
    })
  }
  return bootstrapPromise
}

export const useAppBootstrap = (): boolean =>
{
  const [ready, setReady] = useState(false)

  useEffect(() =>
  {
    let cancelled = false

    const tryBootstrap = async () =>
    {
      if (!storesHydrated())
      {
        return
      }

      await runBootstrapOnce()

      if (!cancelled)
      {
        setReady(true)
      }
    }

    const offSettingsHydration = useSettingsStore.persist.onFinishHydration(
      () =>
      {
        void tryBootstrap()
      }
    )
    const offBoardsHydration =
      useWorkspaceBoardRegistryStore.persist.onFinishHydration(() =>
      {
        void tryBootstrap()
      })

    void tryBootstrap()

    return () =>
    {
      cancelled = true
      offSettingsHydration()
      offBoardsHydration()
    }
  }, [])

  return ready
}
