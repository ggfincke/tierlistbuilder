// src/features/workspace/boards/model/useSwitchImageStyle.ts
// live image-style (skin) switch for the active board. skins re-point pooled,
// server-resident item images, so the switch is cloud-authoritative: it runs
// the server mutation then re-materializes the snapshot

import { useCallback, useState } from 'react'

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

  const run = useCallback(async (styleId: string | null): Promise<void> =>
  {
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
      toast('Saving recent edits — try switching the image style again in a moment.', 'info')
      return
    }
    if ((state.imageStyleId ?? null) === (styleId ?? null)) return

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
      setIsPending(false)
    }
  }, [])

  return { run, isPending }
}
