// src/features/workspace/sync/useWorkspaceBoardSyncStatus.ts
// effective per-board workspace sync status; combines platform status w/ conflicts

import { useShallow } from 'zustand/react/shallow'

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { useConflictQueueStore } from '~/features/workspace/boards/model/cloud/boardConflictQueueStore'
import {
  resolveBoardSyncStatus,
  useSyncStatusStore,
  type EffectiveBoardSyncStatus,
} from '~/features/platform/sync/state/syncStatusStore'

export const useWorkspaceBoardSyncStatus = (
  boardId: BoardId | null
): EffectiveBoardSyncStatus =>
{
  const { online, storedStatus } = useSyncStatusStore(
    useShallow((state) => ({
      online: state.online,
      storedStatus:
        boardId === null ? 'idle' : (state.statusByBoard[boardId] ?? 'idle'),
    }))
  )
  // boolean derivation keeps the subscription cheap — the hook only re-renders
  // when this board's conflict presence flips, not on every queue update
  const hasConflict = useConflictQueueStore((state) =>
    boardId === null
      ? false
      : state.entries.some((entry) => entry.boardId === boardId)
  )

  return resolveBoardSyncStatus({
    online,
    storedStatus,
    hasConflict,
  })
}
