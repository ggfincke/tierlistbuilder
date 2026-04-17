// src/features/platform/sync/status/syncStatusStore.ts
// per-board sync status store (online flag + stored statuses) & pure resolver
// that combines stored status w/ conflict/online context for the UI

import { create } from 'zustand'

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'

// statuses that live in the store directly. 'conflict' & 'offline' are
// derived at read time (conflict from useConflictQueueStore, offline from
// the global flag below) so they don't get store entries of their own
export type StoredBoardSyncStatus = 'idle' | 'syncing' | 'error'

// full status surfaced to UI — resolved from stored status + conflict
// presence + online flag via resolveBoardSyncStatus
export type EffectiveBoardSyncStatus =
  | StoredBoardSyncStatus
  | 'conflict'
  | 'offline'

interface ResolveBoardSyncStatusOptions
{
  online: boolean
  storedStatus: StoredBoardSyncStatus
  hasConflict: boolean
}

// priority: conflict > offline > stored. conflict takes precedence because
// it blocks sync until the user resolves it; offline hides transient syncing
// & error states that will resume once connectivity returns
export const resolveBoardSyncStatus = ({
  online,
  storedStatus,
  hasConflict,
}: ResolveBoardSyncStatusOptions): EffectiveBoardSyncStatus =>
{
  if (hasConflict)
  {
    return 'conflict'
  }

  if (storedStatus === 'error' || storedStatus === 'syncing')
  {
    return online ? storedStatus : 'offline'
  }

  return 'idle'
}

// updated by cloudSyncScheduler & connectivity module. consumers read via
// useBoardSyncStatus; raw selectors below are for online-flag-only callers
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

export const selectOnline = (state: SyncStatusState): boolean => state.online

export const selectStoredBoardStatus = (
  boardId: BoardId | null
): ((state: SyncStatusState) => StoredBoardSyncStatus) =>
{
  return (state) =>
    boardId === null ? 'idle' : (state.statusByBoard[boardId] ?? 'idle')
}
