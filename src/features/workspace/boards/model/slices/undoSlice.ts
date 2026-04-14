// src/features/workspace/boards/model/slices/undoSlice.ts
// undo/redo history slice — snapshots past/future board state & exposes helpers

import type { BoardSnapshot } from '@/features/workspace/boards/model/contract'
import { extractBoardData } from '@/features/workspace/boards/model/boardSnapshot'
import { MAX_UNDO_HISTORY, isSameSnapshot, selectionUpdate } from './helpers'
import type {
  ActiveBoardSliceCreator,
  ActiveBoardStore,
  UndoSlice,
} from './types'

// build the new past/future stacks for a mutation; returns null when the
// snapshot is unchanged & the future stack is already empty (true no-op)
export const pushUndo = (
  state: ActiveBoardStore
): { past: BoardSnapshot[]; future: BoardSnapshot[] } | null =>
{
  const snapshot = extractBoardData(state)
  const lastSnapshot = state.past[state.past.length - 1]

  if (lastSnapshot && isSameSnapshot(snapshot, lastSnapshot))
  {
    if (state.future.length === 0) return null
    return { past: state.past, future: [] }
  }

  return {
    past: [...state.past, snapshot].slice(-MAX_UNDO_HISTORY),
    future: [],
  }
}

// thread an undo entry through a partial state update — callers pass the
// updated fields & get back a merged patch ready for `set()`
export const withUndo = (
  state: ActiveBoardStore,
  updates: Partial<ActiveBoardStore>
): Partial<ActiveBoardStore> =>
{
  const undo = pushUndo(state)
  return undo ? { ...undo, ...updates } : updates
}

export const createUndoSlice: ActiveBoardSliceCreator<UndoSlice> = (set) => ({
  past: [],
  future: [],

  undo: () =>
    set((state) =>
    {
      const prev = state.past[state.past.length - 1]

      if (!prev)
      {
        return state
      }

      return {
        ...prev,
        past: state.past.slice(0, -1),
        future: [extractBoardData(state), ...state.future].slice(
          0,
          MAX_UNDO_HISTORY
        ),
        activeItemId: null,
        dragPreview: null,
        dragGroupIds: [],
        keyboardMode: 'idle',
        keyboardFocusItemId: null,
        ...selectionUpdate([]),
        lastClickedItemId: null,
      }
    }),

  redo: () =>
    set((state) =>
    {
      const next = state.future[0]

      if (!next)
      {
        return state
      }

      return {
        ...next,
        past: [...state.past, extractBoardData(state)].slice(-MAX_UNDO_HISTORY),
        future: state.future.slice(1),
        activeItemId: null,
        dragPreview: null,
        dragGroupIds: [],
        keyboardMode: 'idle',
        keyboardFocusItemId: null,
        ...selectionUpdate([]),
        lastClickedItemId: null,
      }
    }),
})
