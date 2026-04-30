// src/features/workspace/boards/model/slices/boardDataSlice.ts
// board data slice composition for snapshot state & domain action groups

import { createInitialBoardData } from '~/shared/board-data/boardSnapshot'
import { EMPTY_BOARD_SYNC_STATE } from '~/features/workspace/boards/model/sync'
import { createAspectRatioActions } from './boardData/aspectRatioActions'
import { createDeletedItemActions } from './boardData/deletedItemActions'
import { createItemActions } from './boardData/itemActions'
import { createLabelActions } from './boardData/labelActions'
import { createLifecycleActions } from './boardData/lifecycleActions'
import { createStyleOverrideActions } from './boardData/styleOverrideActions'
import { createTierActions } from './boardData/tierActions'
import type { ActiveBoardSliceCreator, BoardDataSlice } from './types'

export const createBoardDataSlice: ActiveBoardSliceCreator<BoardDataSlice> = (
  set,
  get
) => ({
  ...createInitialBoardData('classic'),
  itemsManuallyMoved: false,
  ...EMPTY_BOARD_SYNC_STATE,
  runtimeError: null,
  ...createLifecycleActions(set),
  ...createTierActions(set, get),
  ...createItemActions(set, get),
  ...createDeletedItemActions(set),
  ...createAspectRatioActions(set),
  ...createStyleOverrideActions(set),
  ...createLabelActions(set),
})
