// src/features/workspace/boards/model/boardConflictQueueStore.ts
// queue of unresolved cloud-sync conflicts for the resolver modal

import { create } from 'zustand'

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { CloudBoardState } from '@tierlistbuilder/contracts/workspace/cloudBoard'

export interface ConflictEntry
{
  boardId: BoardId
  cloudBoardExternalId: string
  serverState: CloudBoardState
}

interface ConflictQueueStore
{
  entries: ConflictEntry[]
  enqueue: (
    boardId: BoardId,
    cloudBoardExternalId: string,
    serverState: CloudBoardState
  ) => void
  dismiss: (boardId: BoardId) => void
  clear: () => void
}

export const useConflictQueueStore = create<ConflictQueueStore>((set) => ({
  entries: [],
  enqueue: (boardId, cloudBoardExternalId, serverState) =>
    set((state) =>
    {
      const existingIndex = state.entries.findIndex(
        (entry) => entry.boardId === boardId
      )

      if (existingIndex >= 0)
      {
        const existing = state.entries[existingIndex]
        if (
          existing?.serverState === serverState &&
          existing.cloudBoardExternalId === cloudBoardExternalId
        )
        {
          return state
        }

        const next = state.entries.slice()
        next[existingIndex] = {
          boardId,
          cloudBoardExternalId,
          serverState,
        }
        return { entries: next }
      }

      return {
        entries: [
          ...state.entries,
          { boardId, cloudBoardExternalId, serverState },
        ],
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
