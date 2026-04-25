// src/features/workspace/boards/model/slices/boardData/lifecycleActions.ts
// board data lifecycle actions for runtime errors, reset, & load

import { createFreshRuntimeState } from '~/features/workspace/boards/model/runtime'
import { resetBoardData } from '~/features/workspace/boards/model/boardSnapshot'
import type { ActiveBoardSliceCreator, BoardDataSlice } from '../types'

type LifecycleActions = Pick<
  BoardDataSlice,
  'setRuntimeError' | 'clearRuntimeError' | 'resetBoard' | 'loadBoard'
>

type SliceArgs = Parameters<ActiveBoardSliceCreator<BoardDataSlice>>

export const createLifecycleActions = (
  set: SliceArgs[0]
): LifecycleActions => ({
  setRuntimeError: (message) =>
    set((state) =>
      state.runtimeError === message ? state : { runtimeError: message }
    ),

  clearRuntimeError: () =>
    set((state) =>
      state.runtimeError === null ? state : { runtimeError: null }
    ),

  resetBoard: (paletteId) =>
    set((state) => ({
      ...resetBoardData(state, paletteId),
      ...createFreshRuntimeState(),
    })),

  loadBoard: (data) =>
    set(() => ({
      ...data,
      ...createFreshRuntimeState(),
    })),
})
