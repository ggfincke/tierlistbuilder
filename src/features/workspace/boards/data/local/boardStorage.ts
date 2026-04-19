// src/features/workspace/boards/data/local/boardStorage.ts
// board localStorage I/O for persisted board payloads

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import {
  EMPTY_BOARD_SYNC_STATE,
  normalizeBoardSyncState,
  type BoardSyncState,
} from '~/features/workspace/boards/model/sync'
import {
  deleteBrowserStorageItem,
  getBrowserStorage,
  isStorageQuotaError,
  readBrowserStorageItem,
} from '~/shared/lib/browserStorage'
import {
  STORAGE_FULL_MESSAGE,
  STORAGE_SAVE_FAILED_MESSAGE,
} from '~/shared/lib/storageMetering'
import { isRecord } from '~/shared/lib/typeGuards'

// schema version for board payloads — bumped only on breaking user-data
// changes. envelope treats any mismatched stored version as corrupted &
// loads defaults (no migration chain before pre-1.0 reset)
export const BOARD_DATA_VERSION = 1

// build a per-board localStorage key from its ID
export const boardStorageKey = (id: BoardId): string => `tier-list-board-${id}`

// build the per-board localStorage key for cloud sync metadata
export const boardSyncStorageKey = (id: BoardId): string =>
  `tier-list-board-sync-${id}`

interface StoredBoardEnvelope
{
  version: number
  data: Partial<BoardSnapshot>
}

type LoadedBoardEnvelope =
  | { status: 'missing'; data: null }
  | { status: 'corrupted'; data: null }
  | { status: 'ok'; data: Partial<BoardSnapshot> }

export type BoardLoadResult =
  | {
      status: 'missing'
      data: null
      sync: BoardSyncState
    }
  | {
      status: 'corrupted'
      data: null
      sync: BoardSyncState
    }
  | {
      status: 'ok'
      data: Partial<BoardSnapshot>
      sync: BoardSyncState
    }

interface SaveBoardToStorageOptions
{
  syncState?: BoardSyncState
  onError?: (message: string) => void
}

export type StorageWriteResult = { ok: true } | { ok: false; message: string }

const writeStorageValue = (
  key: string,
  value: string,
  onError?: (message: string) => void
): StorageWriteResult =>
{
  try
  {
    getBrowserStorage()?.setItem(key, value)
    return { ok: true }
  }
  catch (error)
  {
    const message = isStorageQuotaError(error)
      ? STORAGE_FULL_MESSAGE
      : STORAGE_SAVE_FAILED_MESSAGE
    onError?.(message)
    return { ok: false, message }
  }
}

const writeBoardSyncState = (
  boardId: BoardId,
  syncState: BoardSyncState,
  onError?: (message: string) => void
): StorageWriteResult =>
{
  return writeStorageValue(
    boardSyncStorageKey(boardId),
    JSON.stringify(syncState),
    onError
  )
}

const readStoredBoardSyncState = (boardId: BoardId): BoardSyncState =>
{
  const raw = readBrowserStorageItem(boardSyncStorageKey(boardId))
  if (!raw) return EMPTY_BOARD_SYNC_STATE

  try
  {
    return normalizeBoardSyncState(JSON.parse(raw))
  }
  catch
  {
    return EMPTY_BOARD_SYNC_STATE
  }
}

// read only the sync sidecar & skip envelope parsing so a corrupt local board
// still surfaces cloudBoardExternalId for cloud-row cleanup
export const loadBoardSyncStateOnly = (boardId: BoardId): BoardSyncState =>
  readStoredBoardSyncState(boardId)

const writeBoardEnvelope = (
  boardId: BoardId,
  envelope: StoredBoardEnvelope,
  onError?: (message: string) => void
): StorageWriteResult =>
{
  return writeStorageValue(
    boardStorageKey(boardId),
    JSON.stringify(envelope),
    onError
  )
}

const readStoredBoardEnvelope = (boardId: BoardId): LoadedBoardEnvelope =>
{
  try
  {
    const raw = readBrowserStorageItem(boardStorageKey(boardId))
    if (!raw)
    {
      return {
        status: 'missing',
        data: null,
      }
    }

    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || !isRecord(parsed.data))
    {
      return {
        status: 'corrupted',
        data: null,
      }
    }

    const { version } = parsed
    if (
      typeof version !== 'number' ||
      !Number.isFinite(version) ||
      version < 1 ||
      version > BOARD_DATA_VERSION
    )
    {
      return {
        status: 'corrupted',
        data: null,
      }
    }

    return {
      status: 'ok',
      data: parsed.data as Partial<BoardSnapshot>,
    }
  }
  catch
  {
    return {
      status: 'corrupted',
      data: null,
    }
  }
}

// save board data to its per-board localStorage key
export const saveBoardToStorage = (
  boardId: BoardId,
  data: BoardSnapshot,
  options: SaveBoardToStorageOptions = {}
): StorageWriteResult =>
{
  const envelopeResult = writeBoardEnvelope(
    boardId,
    {
      version: BOARD_DATA_VERSION,
      data,
    },
    options.onError
  )

  if (options.syncState)
  {
    if (!envelopeResult.ok)
    {
      return envelopeResult
    }

    return writeBoardSyncState(boardId, options.syncState, options.onError)
  }

  return envelopeResult
}

// save sync metadata to its own key so autosave & sync completion don't race
export const saveBoardSyncToStorage = (
  boardId: BoardId,
  syncState: BoardSyncState,
  onError?: (message: string) => void
): StorageWriteResult =>
{
  return writeBoardSyncState(boardId, syncState, onError)
}

// load board data from its per-board localStorage key
export const loadBoardFromStorage = (boardId: BoardId): BoardLoadResult =>
{
  const result = readStoredBoardEnvelope(boardId)

  if (result.status !== 'ok')
  {
    return {
      status: result.status,
      data: null,
      sync: EMPTY_BOARD_SYNC_STATE,
    }
  }

  return {
    status: 'ok',
    data: result.data,
    sync: readStoredBoardSyncState(boardId),
  }
}

// remove a board's per-board localStorage key
export const removeBoardFromStorage = (boardId: BoardId): void =>
{
  deleteBrowserStorageItem(boardStorageKey(boardId))
  deleteBrowserStorageItem(boardSyncStorageKey(boardId))
}
