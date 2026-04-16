// src/features/workspace/boards/model/slices/undoSlice.ts
// undo/redo history slice — snapshots past/future board state & exposes helpers

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import { extractBoardData } from '~/features/workspace/boards/model/boardSnapshot'
import { MAX_UNDO_HISTORY, isSameSnapshot, selectionUpdate } from './helpers'
import type {
  ActiveBoardSliceCreator,
  ActiveBoardStore,
  UndoSlice,
} from './types'

export const DEFAULT_UNDO_LABEL = 'Change'

interface UndoStacksPatch
{
  past: BoardSnapshot[]
  pastLabels: string[]
  future: BoardSnapshot[]
  futureLabels: string[]
}

// build the new past/future stacks for a mutation; returns null when the
// snapshot is unchanged & the future stack is already empty (true no-op)
export const pushUndo = (
  state: ActiveBoardStore,
  label: string = DEFAULT_UNDO_LABEL
): UndoStacksPatch | null =>
{
  const snapshot = extractBoardData(state)
  const lastSnapshot = state.past[state.past.length - 1]

  if (lastSnapshot && isSameSnapshot(snapshot, lastSnapshot))
  {
    if (state.future.length === 0) return null
    return {
      past: state.past,
      pastLabels: state.pastLabels,
      future: [],
      futureLabels: [],
    }
  }

  return {
    past: [...state.past, snapshot].slice(-MAX_UNDO_HISTORY),
    pastLabels: [...state.pastLabels, label].slice(-MAX_UNDO_HISTORY),
    future: [],
    futureLabels: [],
  }
}

// thread an undo entry through a partial state update — callers pass the
// updated fields & a human-readable label, & get back a merged patch ready
// for `set()`
export const withUndo = (
  state: ActiveBoardStore,
  updates: Partial<ActiveBoardStore>,
  label: string = DEFAULT_UNDO_LABEL
): Partial<ActiveBoardStore> =>
{
  const undo = pushUndo(state, label)
  return undo ? { ...undo, ...updates } : updates
}

export const createUndoSlice: ActiveBoardSliceCreator<UndoSlice> = (
  set,
  get
) => ({
  past: [],
  pastLabels: [],
  future: [],
  futureLabels: [],

  undo: () =>
  {
    const state = get()
    const prev = state.past[state.past.length - 1]
    if (!prev) return null

    const label =
      state.pastLabels[state.pastLabels.length - 1] ?? DEFAULT_UNDO_LABEL

    set(() => ({
      ...prev,
      past: state.past.slice(0, -1),
      pastLabels: state.pastLabels.slice(0, -1),
      future: [extractBoardData(state), ...state.future].slice(
        0,
        MAX_UNDO_HISTORY
      ),
      futureLabels: [label, ...state.futureLabels].slice(0, MAX_UNDO_HISTORY),
      activeItemId: null,
      dragPreview: null,
      dragGroupIds: [],
      keyboardMode: 'idle',
      keyboardFocusItemId: null,
      ...selectionUpdate([]),
      lastClickedItemId: null,
    }))

    return { label }
  },

  redo: () =>
  {
    const state = get()
    const next = state.future[0]
    if (!next) return null

    const label = state.futureLabels[0] ?? DEFAULT_UNDO_LABEL

    set(() => ({
      ...next,
      past: [...state.past, extractBoardData(state)].slice(-MAX_UNDO_HISTORY),
      pastLabels: [...state.pastLabels, label].slice(-MAX_UNDO_HISTORY),
      future: state.future.slice(1),
      futureLabels: state.futureLabels.slice(1),
      activeItemId: null,
      dragPreview: null,
      dragGroupIds: [],
      keyboardMode: 'idle',
      keyboardFocusItemId: null,
      ...selectionUpdate([]),
      lastClickedItemId: null,
    }))

    return { label }
  },
})
