// src/features/workspace/boards/model/useWarmActiveBoardImages.ts
// re-warm the in-memory image cache from the active board on shell mount &
// active-board switch

import { useEffect } from 'react'

import { extractBoardData } from '~/shared/board-data/boardSnapshot'
import { warmFromBoard } from '~/shared/images/imageBlobCache'
import { isAbortError } from '~/shared/lib/errors'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'

// bootstrap warms the image cache once; route remounts of WorkspaceShell
// otherwise leave local-only items blank if blob URLs were dropped while
// unmounted. `warmFromBoard` short-circuits on cached hashes
export const useWarmActiveBoardImages = (enabled: boolean): void =>
{
  const activeBoardId = useWorkspaceBoardRegistryStore(
    (state) => state.activeBoardId
  )

  useEffect(() =>
  {
    if (!enabled || !activeBoardId) return
    const controller = new AbortController()
    const snapshot = extractBoardData(useActiveBoardStore.getState())
    void warmFromBoard(snapshot, { signal: controller.signal }).catch((err) =>
    {
      if (!isAbortError(err)) throw err
    })
    return () => controller.abort()
  }, [enabled, activeBoardId])
}
