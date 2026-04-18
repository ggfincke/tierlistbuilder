// src/features/workspace/boards/model/slices/runtimeErrorSlice.ts
// runtime error slice — user-visible error banner state

import type { ActiveBoardSliceCreator, RuntimeErrorSlice } from './types'

export const createRuntimeErrorSlice: ActiveBoardSliceCreator<
  RuntimeErrorSlice
> = (set) => ({
  runtimeError: null,

  setRuntimeError: (message) =>
    set((state) =>
      state.runtimeError === message ? state : { runtimeError: message }
    ),

  clearRuntimeError: () =>
    set((state) =>
      state.runtimeError === null ? state : { runtimeError: null }
    ),
})
