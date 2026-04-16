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
import {
  clearShareFragment,
  decodeBoardFromShareFragment,
  getShareFragment,
} from '~/features/workspace/sharing/lib/hashShare'

// import a shared board from the URL hash fragment if present
const handleShareFragment = async (): Promise<void> =>
{
  const fragment = getShareFragment()
  if (!fragment) return

  try
  {
    const data = await decodeBoardFromShareFragment(fragment)
    await importBoardSession(data)
  }
  catch
  {
    // silently ignore corrupted share links — board session is still valid
  }
  finally
  {
    clearShareFragment()
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
      await handleShareFragment()
    })()
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
