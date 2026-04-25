// src/features/workspace/boards/model/slices/undoSlice.ts
// undo/redo history slice — snapshots past/future board state & exposes helpers

import type { TierId } from '@tierlistbuilder/contracts/lib/ids'
import type { Tier } from '@tierlistbuilder/contracts/workspace/board'
import { extractBoardData } from '~/features/workspace/boards/model/boardSnapshot'
import {
  createUndoRestoreRuntimePatch,
  type UndoEntry,
} from '~/features/workspace/boards/model/runtime'
import { MAX_UNDO_HISTORY, isSameSnapshot } from './helpers'
import type {
  ActiveBoardSliceCreator,
  ActiveBoardStore,
  UndoSlice,
} from './types'

export const DEFAULT_UNDO_LABEL = 'Change'

type UndoStacksPatch = Pick<ActiveBoardStore, 'past' | 'future'>

// build the new past/future stacks for a mutation; returns null when the
// snapshot is unchanged & the future stack is already empty (true no-op)
export const pushUndo = (
  state: ActiveBoardStore,
  label: string = DEFAULT_UNDO_LABEL
): UndoStacksPatch | null =>
{
  const snapshot = extractBoardData(state)
  const lastEntry = state.past[state.past.length - 1]

  if (lastEntry && isSameSnapshot(snapshot, lastEntry.snapshot))
  {
    if (state.future.length === 0) return null
    return {
      past: state.past,
      future: [],
    }
  }

  return {
    past: [...state.past, { snapshot, label }].slice(-MAX_UNDO_HISTORY),
    future: [],
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

// apply a mapper to one tier; returns a withUndo patch, or null when the
// tier is missing or the mapper returns null / the same ref
export const mapTier = (
  state: ActiveBoardStore,
  tierId: TierId,
  label: string,
  mapper: (tier: Tier) => Tier | null
): Partial<ActiveBoardStore> | null =>
{
  const tier = state.tiers.find((entry) => entry.id === tierId)
  if (!tier) return null
  const next = mapper(tier)
  if (next === null || next === tier) return null
  return withUndo(
    state,
    {
      tiers: state.tiers.map((entry) => (entry.id === tierId ? next : entry)),
    },
    label
  )
}

export const createUndoSlice: ActiveBoardSliceCreator<UndoSlice> = (
  set,
  get
) => ({
  past: [],
  future: [],

  undo: () =>
  {
    const state = get()
    const prev = state.past[state.past.length - 1]
    if (!prev) return null

    const currentEntry: UndoEntry = {
      snapshot: extractBoardData(state),
      label: prev.label,
    }

    set(() => ({
      ...prev.snapshot,
      past: state.past.slice(0, -1),
      future: [currentEntry, ...state.future].slice(0, MAX_UNDO_HISTORY),
      ...createUndoRestoreRuntimePatch(),
    }))

    return { label: prev.label }
  },

  redo: () =>
  {
    const state = get()
    const next = state.future[0]
    if (!next) return null

    const currentEntry: UndoEntry = {
      snapshot: extractBoardData(state),
      label: next.label,
    }

    set(() => ({
      ...next.snapshot,
      past: [...state.past, currentEntry].slice(-MAX_UNDO_HISTORY),
      future: state.future.slice(1),
      ...createUndoRestoreRuntimePatch(),
    }))

    return { label: next.label }
  },
})
