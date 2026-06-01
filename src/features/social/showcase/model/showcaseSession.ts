// src/features/social/showcase/model/showcaseSession.ts
// enter/exit the showcase editor: stash & persist the active board, gate
// global autosave, & load the showcase into the store

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { saveActiveBoardSnapshot } from '~/features/workspace/boards/model/session/boardSessionPersistence'
import {
  clearPendingAutosave,
  runWithAutosaveSuppressed,
  setShowcaseEditingActive,
} from '~/features/workspace/boards/model/session/boardSessionAutosave'
import { extractBoardData } from '~/shared/board-data/boardSnapshot'
import {
  extractBoardSyncState,
  type BoardSyncState,
} from '~/features/workspace/boards/model/cloud/sync'

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
  // mirror loadBoardState: drop any pending timer & suppress the load's own
  // autosave so borrowing the store never schedules a write
  clearPendingAutosave()
  runWithAutosaveSuppressed(() =>
  {
    useActiveBoardStore.getState().loadBoard(showcase)
  })
}

export const exitShowcaseEditing = (): void =>
{
  setShowcaseEditingActive(false)
  const restore = stashed
  if (!restore) return
  stashed = null
  // same clear+suppress discipline: the restore-load must not schedule a write
  clearPendingAutosave()
  runWithAutosaveSuppressed(() =>
  {
    useActiveBoardStore
      .getState()
      .loadBoard(restore.snapshot, restore.syncState)
  })
}
