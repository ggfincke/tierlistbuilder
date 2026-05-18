// src/app/bootstrap/useAppBootstrap.ts
// bootstrap hook — hydrate persisted stores, initialize board session, & register autosave

import { useCallback, useEffect, useSyncExternalStore } from 'react'

import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import {
  bootstrapBoardSession,
  importBoardSession,
  registerBoardAutosave,
} from '~/features/workspace/boards/model/boardSession'
import {
  clearInboundShareFromUrl,
  resolveInboundShare,
} from '~/features/platform/share/inboundShare'
import { toast } from '~/shared/notifications/useToastStore'

// import a shared board if the URL carries an inbound share marker. scrub the URL
// unconditionally so a refresh doesn't re-trigger the import
const handleInboundShare = async (): Promise<void> =>
{
  const result = await resolveInboundShare()

  try
  {
    if (result.kind === 'resolved')
    {
      await importBoardSession(result.data)
    }
    else if (result.kind === 'failed')
    {
      toast(
        'This share link is no longer available. It may have expired or been removed.',
        'info'
      )
    }
  }
  finally
  {
    clearInboundShareFromUrl()
  }
}

const storesHydrated = () =>
  usePreferencesStore.persist.hasHydrated() &&
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

// module-level ready signal — set once when bootstrap resolves & broadcast
// to every useAppReady subscriber so child routes don't each run their own
// bootstrap effect + onFinishHydration registrations
let appReady = false
const readyListeners = new Set<() => void>()

const markAppReady = (): void =>
{
  if (appReady) return
  appReady = true
  for (const listener of readyListeners)
  {
    listener()
  }
}

const subscribeAppReady = (listener: () => void): (() => void) =>
{
  readyListeners.add(listener)
  return () =>
  {
    readyListeners.delete(listener)
  }
}

const getAppReadySnapshot = (): boolean => appReady

export const useAppReady = (): boolean =>
  useSyncExternalStore(
    subscribeAppReady,
    getAppReadySnapshot,
    getAppReadySnapshot
  )

// owner hook — call exactly once at the root of the app chrome so the
// hydration listeners & bootstrap kickoff happen in one place. child routes
// subscribe via useAppReady instead of mounting their own bootstrap effect
export const useAppBootstrap = (): boolean =>
{
  const subscribe = useCallback(
    (listener: () => void) => subscribeAppReady(listener),
    []
  )

  useEffect(() =>
  {
    if (appReady) return

    let cancelled = false

    const tryBootstrap = async () =>
    {
      if (!storesHydrated()) return

      await runBootstrapOnce()

      if (!cancelled)
      {
        markAppReady()
      }
    }

    const offPreferencesHydration =
      usePreferencesStore.persist.onFinishHydration(() =>
      {
        void tryBootstrap()
      })
    const offBoardsHydration =
      useWorkspaceBoardRegistryStore.persist.onFinishHydration(() =>
      {
        void tryBootstrap()
      })

    void tryBootstrap()

    return () =>
    {
      cancelled = true
      offPreferencesHydration()
      offBoardsHydration()
    }
  }, [])

  return useSyncExternalStore(subscribe, getAppReadySnapshot, getAppReadySnapshot)
}
