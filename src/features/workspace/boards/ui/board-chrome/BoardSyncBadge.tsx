// src/features/workspace/boards/ui/board-chrome/BoardSyncBadge.tsx
// inline sync-status badge for per-board lists (BoardManager); renders nothing
// when idle, otherwise a small icon w/ short tooltip copy

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { SyncStatusVisualView } from '~/features/platform/sync/state/SyncStatusVisualView'
import { getSyncStatusVisual } from '~/features/platform/sync/state/syncStatusVisuals'
import { useWorkspaceBoardSyncStatus } from '~/features/workspace/sync/useWorkspaceBoardSyncStatus'

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
  const status = useWorkspaceBoardSyncStatus(boardId)

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
