// src/features/workspace/boards/model/useSwitchImageStyle.ts
// live image-style (skin) switch for the active board. skins re-point pooled, server-resident
// item images, so it's cloud-authoritative: run the server mutation then re-materialize the snapshot

import { useCallback, useRef, useState } from 'react'

import { switchBoardImageStyleImperative } from '~/features/workspace/boards/data/cloud/boardRepository'
import { activateCloudBoardAsActive } from '~/features/workspace/boards/model/cloud/cloudBoardActivation'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { toast } from '~/shared/notifications/useToastStore'

interface SwitchImageStyleAction
{
  run: (styleId: string | null) => Promise<void>
  isPending: boolean
}

export const useSwitchImageStyle = (): SwitchImageStyleAction =>
{
  const [isPending, setIsPending] = useState(false)
  // re-entry guard: roving the picker (or a double-click) can fire run() again
  // before the prior switch + re-materialize settle. ref (not isPending) so the
  // []-dep callback never reads a stale value
  const inFlightRef = useRef(false)

  const run = useCallback(async (styleId: string | null): Promise<void> =>
  {
    if (inFlightRef.current) return
    const state = useActiveBoardStore.getState()
    const cloudBoardExternalId = state.cloudBoardExternalId
    // an unsynced local board has no server row to re-point against; the skin
    // switch only works once the board has synced to the cloud
    if (!cloudBoardExternalId)
    {
      toast('Sync this board to the cloud to switch image styles.', 'info')
      return
    }
    // switching while there are unflushed edits would bump the server revision
    // out from under them -> the post-switch re-materialize is skipped (clean
    // guard) & the next flush conflicts. wait for the board to settle first
    if (state.pendingSyncAt !== null)
    {
      toast(
        'Saving recent edits — try switching the image style again in a moment.',
        'info'
      )
      return
    }
    if ((state.imageStyleId ?? null) === (styleId ?? null)) return

    inFlightRef.current = true
    setIsPending(true)
    try
    {
      await switchBoardImageStyleImperative({
        boardExternalId: cloudBoardExternalId,
        styleId,
      })
      // pull-based sync: re-materialize so the re-pointed images, reframe, &
      // imageStyleId land in the active store
      await activateCloudBoardAsActive(cloudBoardExternalId)
    }
    catch (error)
    {
      toast('Could not switch image style. Try again.', 'error')
      throw error
    }
    finally
    {
      inFlightRef.current = false
      setIsPending(false)
    }
  }, [])

  return { run, isPending }
}
