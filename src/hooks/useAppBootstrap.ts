// src/hooks/useAppBootstrap.ts
// bootstrap hook — hydrate persisted stores, initialize board session, & register autosave

import { useEffect, useRef, useState } from 'react'

import { useBoardManagerStore } from '../store/useBoardManagerStore'
import { useSettingsStore } from '../store/useSettingsStore'
import {
  bootstrapBoardSession,
  registerBoardAutosave,
} from '../services/boardSession'

export const useAppBootstrap = (): boolean =>
{
  const [ready, setReady] = useState(
    useSettingsStore.persist.hasHydrated() &&
      useBoardManagerStore.persist.hasHydrated()
  )
  const bootstrappedRef = useRef(false)

  useEffect(() =>
  {
    const finishBootstrap = () =>
    {
      if (
        !useSettingsStore.persist.hasHydrated() ||
        !useBoardManagerStore.persist.hasHydrated() ||
        bootstrappedRef.current
      )
      {
        return
      }

      bootstrappedRef.current = true
      bootstrapBoardSession()
      registerBoardAutosave()
      setReady(true)
    }

    const offSettingsHydration =
      useSettingsStore.persist.onFinishHydration(finishBootstrap)
    const offBoardsHydration =
      useBoardManagerStore.persist.onFinishHydration(finishBootstrap)

    finishBootstrap()

    return () =>
    {
      offSettingsHydration()
      offBoardsHydration()
    }
  }, [])

  return ready
}
