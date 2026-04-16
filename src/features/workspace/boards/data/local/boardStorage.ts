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

// current board payload schema version — bumped only on genuinely breaking
// user-data changes. v2 moves image bytes from inline `imageUrl` to IDB.
// v3 wraps board snapshots in a versioned envelope
export const BOARD_DATA_VERSION = 3

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

const writeStorageValue = (
  key: string,
  value: string,
  onError?: (message: string) => void
): void =>
{
  try
  {
    getBrowserStorage()?.setItem(key, value)
  }
  catch (error)
  {
    onError?.(
      isStorageQuotaError(error)
        ? STORAGE_FULL_MESSAGE
        : STORAGE_SAVE_FAILED_MESSAGE
    )
  }
}

const hasPersistedBoardDataShape = (
  value: Record<string, unknown>
): value is Partial<BoardSnapshot> =>
  Array.isArray(value.tiers) ||
  isRecord(value.items) ||
  Array.isArray(value.unrankedItemIds) ||
  Array.isArray(value.deletedItems)

const hasBoardSyncState = (value: BoardSyncState): boolean =>
  value.lastSyncedRevision !== null || value.cloudBoardExternalId !== null

const writeBoardSyncState = (
  boardId: BoardId,
  syncState: BoardSyncState,
  onError?: (message: string) => void
): void =>
{
  writeStorageValue(
    boardSyncStorageKey(boardId),
    JSON.stringify(syncState),
    onError
  )
}

const readStoredBoardSyncState = (
  boardId: BoardId,
  legacySyncState: BoardSyncState = EMPTY_BOARD_SYNC_STATE
): BoardSyncState =>
{
  const raw = readBrowserStorageItem(boardSyncStorageKey(boardId))

  if (!raw)
  {
    const normalizedLegacy = normalizeBoardSyncState(legacySyncState)

    if (hasBoardSyncState(normalizedLegacy))
    {
      writeBoardSyncState(boardId, normalizedLegacy)
    }

    return normalizedLegacy
  }

  try
  {
    return normalizeBoardSyncState(JSON.parse(raw))
  }
  catch
  {
    return normalizeBoardSyncState(legacySyncState)
  }
}

const writeBoardEnvelope = (
  boardId: BoardId,
  envelope: StoredBoardEnvelope,
  onError?: (message: string) => void
): void =>
{
  writeStorageValue(boardStorageKey(boardId), JSON.stringify(envelope), onError)
}

const readStoredBoardEnvelope = (
  boardId: BoardId
): Omit<BoardLoadResult, 'sync'> & {
  legacySyncState?: BoardSyncState
} =>
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
    if (!isRecord(parsed))
    {
      return {
        status: 'corrupted',
        data: null,
      }
    }

    if (isRecord(parsed.data))
    {
      const version = typeof parsed.version === 'number' ? parsed.version : 1
      if (
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
        legacySyncState: normalizeBoardSyncState(parsed.sync),
      }
    }

    if (!hasPersistedBoardDataShape(parsed))
    {
      return {
        status: 'corrupted',
        data: null,
      }
    }

    return {
      status: 'ok',
      data: parsed as Partial<BoardSnapshot>,
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
): void =>
{
  writeBoardEnvelope(
    boardId,
    {
      version: BOARD_DATA_VERSION,
      data,
    },
    options.onError
  )

  if (options.syncState)
  {
    writeBoardSyncState(boardId, options.syncState, options.onError)
  }
}

// save sync metadata to its own key so autosave & sync completion don't race
export const saveBoardSyncToStorage = (
  boardId: BoardId,
  syncState: BoardSyncState,
  onError?: (message: string) => void
): void =>
{
  writeBoardSyncState(boardId, syncState, onError)
}

// load board data from its per-board localStorage key
export const loadBoardFromStorage = (boardId: BoardId): BoardLoadResult =>
{
  const result = readStoredBoardEnvelope(boardId)

  if (result.status !== 'ok' || result.data === null)
  {
    return {
      status: result.status === 'ok' ? 'corrupted' : result.status,
      data: null,
      sync: EMPTY_BOARD_SYNC_STATE,
    }
  }

  return {
    status: 'ok',
    data: result.data,
    sync: readStoredBoardSyncState(boardId, result.legacySyncState),
  }
}

// remove a board's per-board localStorage key
export const removeBoardFromStorage = (boardId: BoardId): void =>
{
  deleteBrowserStorageItem(boardStorageKey(boardId))
  deleteBrowserStorageItem(boardSyncStorageKey(boardId))
}
