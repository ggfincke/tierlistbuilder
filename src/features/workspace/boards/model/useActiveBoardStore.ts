// src/features/workspace/boards/model/useActiveBoardStore.ts
// * active board store — composes board data, selection, drag preview,
// keyboard, undo, & runtime-error slices into a single Zustand store

import { create } from 'zustand'

import { createBoardDataSlice } from './slices/boardDataSlice'
import { createDragPreviewSlice } from './slices/dragPreviewSlice'
import { createKeyboardSlice } from './slices/keyboardSlice'
import { createRuntimeErrorSlice } from './slices/runtimeErrorSlice'
import { createSelectionSlice } from './slices/selectionSlice'
import { createUndoSlice } from './slices/undoSlice'
import type { ActiveBoardStore } from './slices/types'

export { selectKeyboardTabStopItemId } from './slices/selectors'
export type { ActiveBoardStore } from './slices/types'

export const useActiveBoardStore = create<ActiveBoardStore>()((...args) => ({
  ...createBoardDataSlice(...args),
  ...createSelectionSlice(...args),
  ...createDragPreviewSlice(...args),
  ...createKeyboardSlice(...args),
  ...createUndoSlice(...args),
  ...createRuntimeErrorSlice(...args),
}))
