// src/features/workspace/boards/model/slices/board-data-actions/lifecycleActions.ts
// board data lifecycle actions for sync state, runtime errors, reset, & load

import type { BoardSyncState } from '~/features/workspace/boards/model/sync'
import { createFreshRuntimeState } from '~/features/workspace/boards/model/runtime'
import { resetBoardData } from '~/shared/board-data/boardSnapshot'
import {
  EMPTY_BOARD_SYNC_STATE,
  extractBoardSyncState,
} from '~/features/workspace/boards/model/sync'
import { countActiveItems } from '~/features/workspace/boards/model/slices/helpers'
import { createBoardSyncStatePatch } from '~/features/workspace/boards/model/slices/syncStateOps'
import type {
  ActiveBoardSliceCreator,
  BoardDataSlice,
} from '~/features/workspace/boards/model/slices/types'

type LifecycleActions = Pick<
  BoardDataSlice,
  | 'setSyncState'
  | 'setRuntimeError'
  | 'clearRuntimeError'
  | 'resetBoard'
  | 'loadBoard'
>

type SliceArgs = Parameters<ActiveBoardSliceCreator<BoardDataSlice>>

export const createLifecycleActions = (
  set: SliceArgs[0]
): LifecycleActions => ({
  setSyncState: (syncState) =>
    set((state) => createBoardSyncStatePatch(state, syncState) ?? state),

  setRuntimeError: (message) =>
    set((state) =>
      state.runtimeError === message ? state : { runtimeError: message }
    ),

  clearRuntimeError: () =>
    set((state) =>
      state.runtimeError === null ? state : { runtimeError: null }
    ),

  resetBoard: (paletteId) =>
    set((state) =>
    {
      const data = resetBoardData(state, paletteId)
      return {
        ...data,
        ...createFreshRuntimeState(),
        activeItemCount: countActiveItems(data.items),
        ...extractBoardSyncState(state),
      }
    }),

  loadBoard: (data, syncState: BoardSyncState = EMPTY_BOARD_SYNC_STATE) =>
    set(() => ({
      ...data,
      ...createFreshRuntimeState(),
      activeItemCount: countActiveItems(data.items),
      ...syncState,
    })),
})
