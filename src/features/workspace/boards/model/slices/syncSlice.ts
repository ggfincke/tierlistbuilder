// src/features/workspace/boards/model/slices/syncSlice.ts
// sync slice — cloud sync revision cursor & board identity

import type { ActiveBoardSliceCreator, SyncSlice } from './types'
import { EMPTY_BOARD_SYNC_STATE } from '~/features/workspace/boards/model/sync'

export const createSyncSlice: ActiveBoardSliceCreator<SyncSlice> = (set) => ({
  ...EMPTY_BOARD_SYNC_STATE,

  setSyncState: (state) => set(state),
})
