// src/features/workspace/boards/ui/BoardSyncBadge.tsx
// inline sync-status badge for per-board lists (BoardManager); renders nothing
// when idle, otherwise a small icon w/ short tooltip copy

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { useBoardSyncStatus } from '~/features/platform/sync/status/useBoardSyncStatus'
import { SyncStatusVisualView } from '~/features/platform/sync/status/SyncStatusVisualView'
import { getSyncStatusVisual } from '~/features/platform/sync/status/syncStatusVisuals'

interface BoardSyncBadgeProps
{
  boardId: BoardId
  // shown alongside the icon's description in the title tooltip so the
  // user sees which board the status refers to when this is one of many
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
