// src/features/workspace/boards/model/useActiveBoardStore.ts
// * active board store — composes board data, selection, drag preview,
// keyboard, & undo slices into a single Zustand store

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

import { createBoardDataSlice } from '~/features/workspace/boards/model/slices/boardDataSlice'
import { createDragPreviewSlice } from '~/features/workspace/boards/model/slices/dragPreviewSlice'
import { createKeyboardSlice } from '~/features/workspace/boards/model/slices/keyboardSlice'
import { createSelectionSlice } from '~/features/workspace/boards/model/slices/selectionSlice'
import { createUndoSlice } from '~/features/workspace/boards/model/slices/undoSlice'
import type { ActiveBoardStore } from '~/features/workspace/boards/model/slices/types'

export {
  selectCanRedo,
  selectCanUndo,
  selectHasKeyboardSelection,
  selectIsDragging,
  selectKeyboardTabStopItemId,
} from '~/features/workspace/boards/model/slices/selectors'

export const useActiveBoardStore = create<ActiveBoardStore>()(
  subscribeWithSelector((...args) => ({
    ...createBoardDataSlice(...args),
    ...createSelectionSlice(...args),
    ...createDragPreviewSlice(...args),
    ...createKeyboardSlice(...args),
    ...createUndoSlice(...args),
  }))
)
