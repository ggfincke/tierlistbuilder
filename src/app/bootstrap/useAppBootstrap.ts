// src/app/bootstrap/useAppBootstrap.ts
// bootstrap hook — hydrate persisted stores, initialize board session, & register autosave

import { useEffect, useRef, useState } from 'react'

import { useWorkspaceBoardRegistryStore } from '@/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { useSettingsStore } from '@/features/workspace/settings/model/useSettingsStore'
import {
  bootstrapBoardSession,
  importBoardSession,
  registerBoardAutosave,
} from '@/features/workspace/boards/data/local/localBoardSession'
import {
  clearShareFragment,
  decodeBoardFromShareFragment,
  getShareFragment,
} from '@/features/workspace/sharing/lib/hashShare'

// import a shared board from the URL hash fragment if present
const handleShareFragment = async (): Promise<void> =>
{
  const fragment = getShareFragment()
  if (!fragment) return

  try
  {
    const data = await decodeBoardFromShareFragment(fragment)
    importBoardSession(data)
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

export const useAppBootstrap = (): boolean =>
{
  const [ready, setReady] = useState(
    useSettingsStore.persist.hasHydrated() &&
      useWorkspaceBoardRegistryStore.persist.hasHydrated()
  )
  const bootstrappedRef = useRef(false)

  useEffect(() =>
  {
    const finishBootstrap = () =>
    {
      if (
        !useSettingsStore.persist.hasHydrated() ||
        !useWorkspaceBoardRegistryStore.persist.hasHydrated() ||
        bootstrappedRef.current
      )
      {
        return
      }

      bootstrappedRef.current = true
      bootstrapBoardSession()
      registerBoardAutosave()
      void handleShareFragment()
      setReady(true)
    }

    const offSettingsHydration =
      useSettingsStore.persist.onFinishHydration(finishBootstrap)
    const offBoardsHydration =
      useWorkspaceBoardRegistryStore.persist.onFinishHydration(finishBootstrap)

    finishBootstrap()

    return () =>
    {
      offSettingsHydration()
      offBoardsHydration()
    }
  }, [])

  return ready
}
