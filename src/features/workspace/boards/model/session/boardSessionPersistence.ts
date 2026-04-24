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
import { normalizeBoardSnapshot } from '~/features/workspace/boards/model/boardSnapshot'
import { extractBoardData } from '~/features/workspace/boards/model/boardSnapshot'
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
} from './boardSessionAutosave'
import { notifyBoardLoaded } from './boardSessionEvents'
import { getActivePaletteId, hasBoardMeta } from './boardSessionRegistry'
import { reportStorageWarningIfNeeded } from './storageWarningReporter'

export interface LoadedBoardState
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

const persistBoardSyncStateToStorage = (
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
  runWithAutosaveSuppressed(() =>
  {
    useActiveBoardStore.getState().loadBoard(snapshot, syncState)
  })

  notifyBoardLoaded(boardId)
}

export const saveBoardSnapshot = (boardId: BoardId): void =>
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
  persistBoardSyncStateToStorage(boardId, syncState)
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

export const persistBoardSyncStateToStorageOnly = (
  boardId: BoardId,
  syncState: BoardSyncState
): void =>
{
  persistBoardSyncStateToStorage(boardId, syncState)
}
