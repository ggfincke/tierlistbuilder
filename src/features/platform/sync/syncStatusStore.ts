// src/features/platform/sync/syncStatusStore.ts
// per-board cloud sync status & global online flag. updated by the scheduler
// (queue/runFlush/onError/onConflict) & by the connectivity module
// (window online/offline events). consumers read via useBoardSyncStatus,
// which combines this store w/ useConflictQueueStore for the effective state

import { create } from 'zustand'

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { StoredBoardSyncStatus } from './boardSyncStatus'

// stored per-board states. 'conflict' & 'offline' are derived at read time
// (conflict from useConflictQueueStore, offline from the global flag below)
// so they don't need entries here
export interface SyncStatusState
{
  // initialized to navigator.onLine in connectivity setup; defaults to true
  // for SSR / test environments w/o a navigator
  online: boolean
  statusByBoard: Record<BoardId, StoredBoardSyncStatus>
  setOnline: (online: boolean) => void
  setBoardStatus: (boardId: BoardId, status: StoredBoardSyncStatus) => void
  // remove a board's entry — called when the board is deleted or after a
  // successful sync brings it back to 'idle' (idle is the implicit default,
  // so we evict instead of storing)
  removeBoardStatus: (boardId: BoardId) => void
  // wipe all per-board state — called on sign-out so a different user
  // signing in doesn't see stale statuses for the previous user's boards
  clear: () => void
}

export const useSyncStatusStore = create<SyncStatusState>((set) => ({
  online: true,
  statusByBoard: {},
  setOnline: (online) => set({ online }),
  setBoardStatus: (boardId, status) =>
    set((state) =>
    {
      if (state.statusByBoard[boardId] === status)
      {
        return state
      }
      return {
        statusByBoard: { ...state.statusByBoard, [boardId]: status },
      }
    }),
  removeBoardStatus: (boardId) =>
    set((state) =>
    {
      if (!(boardId in state.statusByBoard))
      {
        return state
      }
      const next = { ...state.statusByBoard }
      delete next[boardId]
      return { statusByBoard: next }
    }),
  clear: () => set({ statusByBoard: {} }),
}))

// raw selectors. consumers usually want useBoardSyncStatus instead — these
// are exposed for places that need just the online flag or just the stored
// per-board status w/o conflict-queue overlay
export const selectOnline = (state: SyncStatusState): boolean => state.online

export const selectStoredBoardStatus = (
  boardId: BoardId | null
): ((state: SyncStatusState) => StoredBoardSyncStatus) =>
{
  return (state) =>
    boardId === null ? 'idle' : (state.statusByBoard[boardId] ?? 'idle')
}
