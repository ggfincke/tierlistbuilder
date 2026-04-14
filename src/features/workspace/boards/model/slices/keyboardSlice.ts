// src/features/workspace/boards/model/slices/keyboardSlice.ts
// keyboard slice — browse/drag mode state & keyboard navigation actions

import type { ActiveBoardSliceCreator, KeyboardSlice } from './types'

export const createKeyboardSlice: ActiveBoardSliceCreator<KeyboardSlice> = (
  set
) => ({
  keyboardMode: 'idle',
  keyboardFocusItemId: null,

  setKeyboardMode: (mode) => set({ keyboardMode: mode }),

  setKeyboardFocusItemId: (itemId) => set({ keyboardFocusItemId: itemId }),

  clearKeyboardMode: () =>
    set({
      keyboardMode: 'idle',
      keyboardFocusItemId: null,
    }),

  cancelKeyboardDrag: () =>
    set({
      dragPreview: null,
      dragGroupIds: [],
      activeItemId: null,
      keyboardMode: 'idle',
      keyboardFocusItemId: null,
    }),
})
