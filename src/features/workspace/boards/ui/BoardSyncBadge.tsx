// src/features/workspace/boards/ui/BoardSyncBadge.tsx
// inline sync-status badge for per-board lists (BoardManager); renders nothing
// when idle, otherwise a small icon w/ short tooltip copy

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { useBoardSyncStatus } from '~/features/platform/sync/state/useBoardSyncStatus'
import { SyncStatusVisualView } from '~/features/platform/sync/state/SyncStatusVisualView'
import { getSyncStatusVisual } from '~/features/platform/sync/state/syncStatusVisuals'

interface BoardSyncBadgeProps
{
  boardId: BoardId
  boardTitle: string
}

export const BoardSyncBadge = ({
  boardId,
  boardTitle,
}: BoardSyncBadgeProps) =>
{
  const status = useBoardSyncStatus(boardId)

  if (status === 'idle')
  {
    return null
  }

  const visual = getSyncStatusVisual(status, 'short')
  const tooltip = `${boardTitle}: ${visual.description}`

  return (
    <SyncStatusVisualView
      visual={visual}
      variant="inline"
      title={tooltip}
      srLabel={tooltip}
    />
  )
}
