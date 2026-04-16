// src/features/platform/sync/useConflictQueueStore.ts
// queue of unresolved cloud-sync conflicts. modal opens for the head entry;
// resolving it dequeues & exposes the next conflict (if any). global
// one-at-a-time UX — most users will never see >1 simultaneously, but the
// queue handles the rare multi-board case w/o losing any of them

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
  // add a conflict for boardId. if the board is already queued, replace
  // its serverState in place (newer wins, keeps position) so the UI doesn't
  // jump as repeated flushes hit the same conflict
  enqueue: (boardId: BoardId, serverState: CloudBoardState) => void
  // remove a board from the queue. called once the user picks a resolution
  // action & the resolver runs to completion (or fails — see resolver
  // for retry semantics)
  dismiss: (boardId: BoardId) => void
  // drop the entire queue. called on sign-out to avoid surfacing stale
  // conflicts to a different user signing in afterwards
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
