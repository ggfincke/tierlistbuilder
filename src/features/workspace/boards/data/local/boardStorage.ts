// src/features/workspace/boards/data/local/boardStorage.ts
// board localStorage I/O for persisted board payloads

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { BoardSyncState } from '@tierlistbuilder/contracts/workspace/boardSync'
import { BOARD_DATA_VERSION } from '@tierlistbuilder/contracts/workspace/boardEnvelope'
import {
  EMPTY_BOARD_SYNC_STATE,
  normalizeBoardSyncState,
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
} from '~/features/workspace/boards/data/local/storageMetering'
import { collectSnapshotLocalImageHashes } from '~/shared/lib/boardSnapshotItems'
import { logger } from '~/shared/lib/logger'
import { isRecord } from '~/shared/lib/typeGuards'
import {
  clearBlobRefs,
  pruneUnreferencedBlobs,
  replaceBlobRefs,
} from '~/shared/images/imageStore'

import { boardStorageKey, boardSyncStorageKey } from '~/features/workspace/boards/data/local/storageKeys'

export { boardStorageKey, boardSyncStorageKey }

export const boardImageRefScope = (id: BoardId): string => `board:${id}`

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

type StorageWriteResult = { ok: true } | { ok: false; message: string }

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

const trackBoardImageRefs = (boardId: BoardId, data: BoardSnapshot): void =>
{
  void replaceBlobRefs(
    boardImageRefScope(boardId),
    collectSnapshotLocalImageHashes(data)
  ).catch((error) =>
  {
    logger.warn('image', `Failed to update image refs for ${boardId}:`, error)
  })
}

const clearBoardImageRefs = (boardId: BoardId): void =>
{
  void clearBlobRefs(boardImageRefScope(boardId))
    .then(() => pruneUnreferencedBlobs())
    .catch((error) =>
    {
      logger.warn('image', `Failed to clear image refs for ${boardId}:`, error)
    })
}

export const parseBoardEnvelope = (raw: string | null): LoadedBoardEnvelope =>
{
  try
  {
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

const readStoredBoardEnvelope = (boardId: BoardId): LoadedBoardEnvelope =>
  parseBoardEnvelope(readBrowserStorageItem(boardStorageKey(boardId)))

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

    const syncResult = writeBoardSyncState(
      boardId,
      options.syncState,
      options.onError
    )
    trackBoardImageRefs(boardId, data)
    return syncResult
  }

  if (envelopeResult.ok)
  {
    trackBoardImageRefs(boardId, data)
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
  clearBoardImageRefs(boardId)
}
