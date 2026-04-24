// src/features/workspace/boards/model/slices/boardDataSlice.ts
// board data slice composition for snapshot state & domain action groups

import { createInitialBoardData } from '~/features/workspace/boards/model/boardSnapshot'
import { EMPTY_BOARD_SYNC_STATE } from '~/features/workspace/boards/model/sync'
import { createAspectRatioActions } from './boardData/aspectRatioActions'
import { createDeletedItemActions } from './boardData/deletedItemActions'
import { createItemActions } from './boardData/itemActions'
import { createLifecycleActions } from './boardData/lifecycleActions'
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
})
