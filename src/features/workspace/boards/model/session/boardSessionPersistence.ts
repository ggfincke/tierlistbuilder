// src/features/workspace/boards/model/session/boardSessionPersistence.ts
// active-board persistence & loading

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import {
  loadBoardFromStorage,
  saveBoardToStorage,
  type BoardLoadResult,
} from '~/features/workspace/boards/data/local/boardStorage'
import { normalizeBoardSnapshot } from '~/features/workspace/boards/model/boardSnapshot'
import { extractBoardData } from '~/features/workspace/boards/model/boardSnapshot'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { warmFromBoard } from '~/shared/images/imageBlobCache'
import { makeProceedGuard } from '~/shared/lib/proceedGuard'
import { toast } from '~/shared/notifications/useToastStore'
import {
  clearPendingAutosave,
  runWithAutosaveSuppressed,
} from './boardSessionAutosave'
import { notifyBoardLoaded } from './boardSessionEvents'
import { getActivePaletteId } from './boardSessionRegistry'
import { reportStorageWarningIfNeeded } from './storageWarningReporter'

export const loadBoardState = (
  boardId: BoardId,
  snapshot: BoardSnapshot
): void =>
{
  clearPendingAutosave()

  runWithAutosaveSuppressed(() =>
  {
    useActiveBoardStore.getState().loadBoard(snapshot)
  })

  notifyBoardLoaded(boardId)
}

export const saveBoardSnapshot = (boardId: BoardId): void =>
{
  const data = extractBoardData(useActiveBoardStore.getState())
  saveBoardToStorage(boardId, data, {
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
): BoardSnapshot =>
{
  if (result.status === 'corrupted')
  {
    toast('Board data was corrupted and has been reset.', 'error')
  }

  return normalizeBoardSnapshot(
    result.status === 'ok' ? result.data : null,
    getActivePaletteId()
  )
}

export const loadPersistedBoard = (boardId: BoardId): BoardSnapshot =>
  loadedBoardStateFromResult(loadBoardFromStorage(boardId))

export const loadBoardIntoSession = async (
  boardId: BoardId,
  shouldProceed?: () => boolean
): Promise<BoardSnapshot> =>
{
  const canProceed = makeProceedGuard(shouldProceed)
  const snapshot = loadPersistedBoard(boardId)
  await warmFromBoard(snapshot)

  if (!canProceed())
  {
    return snapshot
  }

  loadBoardState(boardId, snapshot)
  return snapshot
}
