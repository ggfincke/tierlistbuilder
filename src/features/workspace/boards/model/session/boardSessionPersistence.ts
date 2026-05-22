// src/features/workspace/boards/model/session/boardSessionPersistence.ts
// active-board persistence, loading, & sync-state writes

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import {
  loadBoardFromStorage,
  saveBoardSyncToStorage,
  saveBoardToStorage,
  type BoardLoadResult,
} from '~/features/workspace/boards/data/local/boardStorage'
import { normalizeBoardSnapshot } from '~/shared/board-data/boardSnapshot'
import { extractBoardData } from '~/shared/board-data/boardSnapshot'
import { resetBoardSelectorCaches } from '~/features/workspace/boards/model/slices/selectors'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import {
  EMPTY_BOARD_SYNC_STATE,
  extractBoardSyncState,
  type BoardSyncState,
} from '~/features/workspace/boards/model/sync'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { warmFromBoard } from '~/shared/images/imageBlobCache'
import { makeProceedGuard } from '~/shared/lib/sync/proceedGuard'
import { toast } from '~/shared/notifications/useToastStore'
import {
  clearPendingAutosave,
  runWithAutosaveSuppressed,
} from '~/features/workspace/boards/model/session/boardSessionAutosave'
import { notifyBoardLoaded } from '~/features/workspace/boards/model/session/boardSessionEvents'
import {
  getActivePaletteId,
  hasBoardMeta,
} from '~/features/workspace/boards/model/session/boardSessionRegistry'
import { reportStorageWarningIfNeeded } from '~/features/workspace/boards/model/session/storageWarningReporter'

interface LoadedBoardState
{
  snapshot: BoardSnapshot
  syncState: BoardSyncState
}

const getActiveBoardSyncState = (): BoardSyncState =>
  extractBoardSyncState(useActiveBoardStore.getState())

const setActiveBoardSyncState = (
  boardId: BoardId,
  syncState: BoardSyncState
): void =>
{
  if (useWorkspaceBoardRegistryStore.getState().activeBoardId !== boardId)
  {
    return
  }

  useActiveBoardStore.getState().setSyncState(syncState)
}

const handleBoardPersistError = (boardId: BoardId, message: string): void =>
{
  if (useWorkspaceBoardRegistryStore.getState().activeBoardId !== boardId)
  {
    return
  }

  useActiveBoardStore.getState().setRuntimeError(message)
}

export const persistBoardSyncStateToStorageOnly = (
  boardId: BoardId,
  syncState: BoardSyncState
): void =>
{
  if (!hasBoardMeta(boardId))
  {
    return
  }

  saveBoardSyncToStorage(boardId, syncState, (message) =>
    handleBoardPersistError(boardId, message)
  )
}

export const loadBoardState = (
  boardId: BoardId,
  snapshot: BoardSnapshot,
  syncState: BoardSyncState = EMPTY_BOARD_SYNC_STATE
): void =>
{
  // drop any timer scheduled by the previous board so it doesn't fire after
  // the switch & write the just-loaded snapshot back to the new board's slot
  clearPendingAutosave()
  resetBoardSelectorCaches()

  runWithAutosaveSuppressed(() =>
  {
    useActiveBoardStore.getState().loadBoard(snapshot, syncState)
  })

  notifyBoardLoaded(boardId)
}

const saveBoardSnapshot = (boardId: BoardId): void =>
{
  const data = extractBoardData(useActiveBoardStore.getState())
  saveBoardToStorage(boardId, data, {
    syncState: getActiveBoardSyncState(),
    onError: (message) =>
      useActiveBoardStore.getState().setRuntimeError(message),
  })

  reportStorageWarningIfNeeded()
}

export const saveActiveBoardSnapshot = (): void =>
{
  clearPendingAutosave()

  const { activeBoardId } = useWorkspaceBoardRegistryStore.getState()

  if (activeBoardId)
  {
    saveBoardSnapshot(activeBoardId)
  }
}

export const loadedBoardStateFromResult = (
  result: BoardLoadResult
): LoadedBoardState =>
{
  if (result.status === 'corrupted')
  {
    toast('Board data was corrupted and has been reset.', 'error')
  }

  return {
    snapshot: normalizeBoardSnapshot(
      result.status === 'ok' ? result.data : null,
      getActivePaletteId()
    ),
    syncState: result.status === 'ok' ? result.sync : EMPTY_BOARD_SYNC_STATE,
  }
}

export const loadPersistedBoard = (boardId: BoardId): BoardSnapshot =>
  loadedBoardStateFromResult(loadBoardFromStorage(boardId)).snapshot

export const loadPersistedBoardState = (boardId: BoardId): LoadedBoardState =>
  loadedBoardStateFromResult(loadBoardFromStorage(boardId))

export const loadBoardIntoSession = async (
  boardId: BoardId,
  shouldProceed?: () => boolean
): Promise<BoardSnapshot> =>
{
  const canProceed = makeProceedGuard(shouldProceed)
  const state = loadPersistedBoardState(boardId)
  await warmFromBoard(state.snapshot)

  if (!canProceed())
  {
    return state.snapshot
  }

  loadBoardState(boardId, state.snapshot, state.syncState)
  return state.snapshot
}

export const persistBoardSyncState = (
  boardId: BoardId,
  syncState: BoardSyncState
): void =>
{
  setActiveBoardSyncState(boardId, syncState)
  persistBoardSyncStateToStorageOnly(boardId, syncState)
}

export const persistBoardStateForSync = (
  boardId: BoardId,
  snapshot: BoardSnapshot,
  syncState: BoardSyncState
): boolean =>
{
  setActiveBoardSyncState(boardId, syncState)

  if (!hasBoardMeta(boardId))
  {
    return false
  }

  return saveBoardToStorage(boardId, snapshot, {
    syncState,
    onError: (message) => handleBoardPersistError(boardId, message),
  }).ok
}
