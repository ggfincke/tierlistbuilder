// src/features/platform/sync/status/useBoardSyncStatus.ts
// effective per-board sync status — combines syncStatusStore w/
// useConflictQueueStore so priority logic lives in one place

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { useConflictQueueStore } from '../conflicts/useConflictQueueStore'
import {
  resolveBoardSyncStatus,
  useSyncStatusStore,
  type EffectiveBoardSyncStatus,
} from './syncStatusStore'

export type { EffectiveBoardSyncStatus } from './syncStatusStore'

export const useBoardSyncStatus = (
  boardId: BoardId | null
): EffectiveBoardSyncStatus =>
{
  const online = useSyncStatusStore((state) => state.online)
  const storedStatus = useSyncStatusStore((state) =>
    boardId === null ? 'idle' : (state.statusByBoard[boardId] ?? 'idle')
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
