// tests/shared-lib/boardStores.ts
// active-board & board-registry reset helper

import type {
  BoardMeta,
  BoardSnapshot,
} from '@tierlistbuilder/contracts/workspace/board'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { BoardSyncState } from '~/features/workspace/boards/model/sync'
import { EMPTY_BOARD_SYNC_STATE } from '~/features/workspace/boards/model/sync'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { createInitialBoardData } from '~/shared/board-data/boardSnapshot'

type RegistryState = {
  boards: BoardMeta[]
  activeBoardId: BoardId | null
}

type ResetBoardStoresOptions = {
  registry?: RegistryState
  snapshot?: BoardSnapshot
  syncState?: BoardSyncState
}

export const resetBoardStores = (
  options: ResetBoardStoresOptions = {}
): void =>
{
  useWorkspaceBoardRegistryStore.setState(
    options.registry ?? { boards: [], activeBoardId: null }
  )
  useActiveBoardStore
    .getState()
    .loadBoard(
      options.snapshot ?? createInitialBoardData('classic'),
      options.syncState ?? EMPTY_BOARD_SYNC_STATE
    )
}
