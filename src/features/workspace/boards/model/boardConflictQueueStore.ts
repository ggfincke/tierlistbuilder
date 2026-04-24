// src/features/workspace/boards/model/boardConflictQueueStore.ts
// queue of unresolved cloud-sync conflicts for the resolver modal

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

export const selectCurrentConflict = (
  state: ConflictQueueStore
): ConflictEntry | null => state.entries[0] ?? null
