// src/features/platform/showcase/model/showcaseSession.ts
// enter/exit the showcase editor — stash & persist the active board, gate the
// global autosave, & load the showcase into the shared board store

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { saveActiveBoardSnapshot } from '~/features/workspace/boards/model/session/boardSessionPersistence'
import { setShowcaseEditingActive } from '~/features/workspace/boards/model/session/boardSessionAutosave'
import { extractBoardData } from '~/shared/board-data/boardSnapshot'
import {
  extractBoardSyncState,
  type BoardSyncState,
} from '~/features/workspace/boards/model/sync'

interface StashedBoard
{
  snapshot: BoardSnapshot
  syncState: BoardSyncState
}

// the real board displaced while editing the showcase; restored on exit
let stashed: StashedBoard | null = null

export const enterShowcaseEditing = (showcase: BoardSnapshot): void =>
{
  if (!stashed)
  {
    const state = useActiveBoardStore.getState()
    stashed = {
      snapshot: extractBoardData(state),
      syncState: extractBoardSyncState(state),
    }
    // persist the real board before the store is borrowed
    saveActiveBoardSnapshot()
  }
  setShowcaseEditingActive(true)
  useActiveBoardStore.getState().loadBoard(showcase)
}

export const exitShowcaseEditing = (): void =>
{
  setShowcaseEditingActive(false)
  if (!stashed) return
  useActiveBoardStore.getState().loadBoard(stashed.snapshot, stashed.syncState)
  stashed = null
}
