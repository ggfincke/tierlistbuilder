// src/features/workspace/boards/model/slices/boardDataSlice.ts
// board data slice composition for snapshot state & domain action groups

import { createInitialBoardData } from '~/shared/board-data/boardSnapshot'
import { EMPTY_BOARD_SYNC_STATE } from '~/features/workspace/boards/model/sync'
import { createAspectRatioActions } from '~/features/workspace/boards/model/slices/boardData/aspectRatioActions'
import { createDeletedItemActions } from '~/features/workspace/boards/model/slices/boardData/deletedItemActions'
import { createItemActions } from '~/features/workspace/boards/model/slices/boardData/itemActions'
import { createLabelActions } from '~/features/workspace/boards/model/slices/boardData/labelActions'
import { createLifecycleActions } from '~/features/workspace/boards/model/slices/boardData/lifecycleActions'
import { createStyleOverrideActions } from '~/features/workspace/boards/model/slices/boardData/styleOverrideActions'
import { createTierActions } from '~/features/workspace/boards/model/slices/boardData/tierActions'
import type { ActiveBoardSliceCreator, BoardDataSlice } from '~/features/workspace/boards/model/slices/types'

export const createBoardDataSlice: ActiveBoardSliceCreator<BoardDataSlice> = (
  set,
  get
) => ({
  ...createInitialBoardData('classic'),
  itemsManuallyMoved: false,
  activeItemCount: 0,
  runtimeError: null,
  ...EMPTY_BOARD_SYNC_STATE,
  ...createLifecycleActions(set),
  ...createTierActions(set, get),
  ...createItemActions(set, get),
  ...createDeletedItemActions(set),
  ...createAspectRatioActions(set),
  ...createStyleOverrideActions(set),
  ...createLabelActions(set),
})
