// src/features/workspace/boards/ui/SyncStatusIndicator.tsx
// active-board cloud sync status indicator — passive chrome w/ long-form copy.
// scheduler retries errors & conflicts auto-open the resolver, so no actions here

import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { useBoardSyncStatus } from '~/features/platform/sync/status/useBoardSyncStatus'
import { SyncStatusVisualView } from '~/features/platform/sync/status/SyncStatusVisualView'
import { getSyncStatusVisual } from '~/features/platform/sync/status/syncStatusVisuals'

interface SyncStatusIndicatorProps
{
  active: boolean
}

export const SyncStatusIndicator = ({ active }: SyncStatusIndicatorProps) =>
{
  const activeBoardId = useWorkspaceBoardRegistryStore(
    (state) => state.activeBoardId
  )
  const boardId = active && activeBoardId !== '' ? activeBoardId : null
  const status = useBoardSyncStatus(boardId)

  if (boardId === null)
  {
    return null
  }

  const visual = getSyncStatusVisual(status, 'long')

  return <SyncStatusVisualView visual={visual} variant="block" />
}
