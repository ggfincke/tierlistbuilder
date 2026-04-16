// src/features/platform/sync/useBoardSyncStatus.ts
// effective per-board sync status — combines the syncStatusStore (online flag
// + per-board stored status) w/ useConflictQueueStore. conflicts stay visible,
// dirty boards read 'offline' while disconnected, & fully idle boards stay
// idle. consumers read this hook instead of the raw stores so the priority
// logic lives in one place

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { useConflictQueueStore } from './useConflictQueueStore'
import { useSyncStatusStore } from './syncStatusStore'
import {
  resolveBoardSyncStatus,
  type EffectiveBoardSyncStatus,
} from './boardSyncStatus'

export type { EffectiveBoardSyncStatus } from './boardSyncStatus'

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
