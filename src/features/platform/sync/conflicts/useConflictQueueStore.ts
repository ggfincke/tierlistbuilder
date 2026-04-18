// src/features/platform/sync/conflicts/useConflictQueueStore.ts
// queue of unresolved cloud-sync conflicts — modal opens for the head entry.
// handles the rare multi-board case w/o losing any conflict

import { create } from 'zustand'

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { CloudBoardState } from '@tierlistbuilder/contracts/workspace/cloudBoard'

export interface ConflictEntry
{
  boardId: BoardId
  serverState: CloudBoardState
}

interface ConflictQueueStore
{
  entries: ConflictEntry[]
  enqueue: (boardId: BoardId, serverState: CloudBoardState) => void
  dismiss: (boardId: BoardId) => void
  clear: () => void
}

export const useConflictQueueStore = create<ConflictQueueStore>((set) => ({
  entries: [],
  enqueue: (boardId, serverState) =>
    set((state) =>
    {
      const existingIndex = state.entries.findIndex(
        (entry) => entry.boardId === boardId
      )

      if (existingIndex >= 0)
      {
        if (state.entries[existingIndex]?.serverState === serverState)
        {
          return state
        }

        const next = state.entries.slice()
        next[existingIndex] = { boardId, serverState }
        return { entries: next }
      }

      return {
        entries: [...state.entries, { boardId, serverState }],
      }
    }),
  dismiss: (boardId) =>
    set((state) => ({
      entries: state.entries.filter((entry) => entry.boardId !== boardId),
    })),
  clear: () => set({ entries: [] }),
}))

// the conflict at the head of the queue — what the modal renders. null
// means no pending conflicts, modal stays closed
export const selectCurrentConflict = (
  state: ConflictQueueStore
): ConflictEntry | null => state.entries[0] ?? null
