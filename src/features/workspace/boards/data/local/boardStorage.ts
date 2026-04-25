// src/features/workspace/boards/data/local/boardStorage.ts
// board localStorage I/O for persisted board payloads

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { BOARD_DATA_VERSION } from '@tierlistbuilder/contracts/workspace/boardEnvelope'
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
import { collectSnapshotLocalImageHashes } from '~/shared/lib/boardSnapshotItems'
import { logger } from '~/shared/lib/logger'
import { isRecord } from '~/shared/lib/typeGuards'
import {
  clearBlobRefs,
  pruneUnreferencedBlobs,
  replaceBlobRefs,
} from '~/shared/images/imageStore'

// build a per-board localStorage key from its ID
export const boardStorageKey = (id: BoardId): string => `tier-list-board-${id}`

export const boardImageRefScope = (id: BoardId): string => `board:${id}`

interface StoredBoardEnvelope
{
  version: number
  data: Partial<BoardSnapshot>
}

export type BoardLoadResult =
  | {
      status: 'missing'
      data: null
    }
  | {
      status: 'corrupted'
      data: null
    }
  | {
      status: 'ok'
      data: Partial<BoardSnapshot>
    }

interface SaveBoardToStorageOptions
{
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

const readStoredBoardEnvelope = (boardId: BoardId): BoardLoadResult =>
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

  if (envelopeResult.ok)
  {
    trackBoardImageRefs(boardId, data)
  }

  return envelopeResult
}

// load board data from its per-board localStorage key
export const loadBoardFromStorage = (boardId: BoardId): BoardLoadResult =>
  readStoredBoardEnvelope(boardId)

// remove a board's per-board localStorage key
export const removeBoardFromStorage = (boardId: BoardId): void =>
{
  deleteBrowserStorageItem(boardStorageKey(boardId))
  clearBoardImageRefs(boardId)
}
