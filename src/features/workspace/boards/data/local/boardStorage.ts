// src/features/workspace/boards/data/local/boardStorage.ts
// board localStorage I/O for persisted board payloads

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import {
  deleteBrowserStorageItem,
  getBrowserStorage,
  isStorageQuotaError,
  readBrowserStorageItem,
} from '@/shared/lib/browserStorage'
import {
  STORAGE_FULL_MESSAGE,
  STORAGE_SAVE_FAILED_MESSAGE,
} from '@/shared/lib/storageMetering'
import { isRecord } from '@/shared/lib/typeGuards'

// current board payload schema version — bumped only on genuinely breaking
// user-data changes. v2 moves image bytes from inline `imageUrl` to IDB,
// referenced by content-hash via `imageRef`
export const BOARD_DATA_VERSION = 2

// build a per-board localStorage key from its ID
export const boardStorageKey = (id: BoardId): string => `tier-list-board-${id}`

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

// save board data to its per-board localStorage key
export const saveBoardToStorage = (
  boardId: BoardId,
  data: BoardSnapshot,
  onError?: (message: string) => void
): void =>
{
  try
  {
    getBrowserStorage()?.setItem(
      boardStorageKey(boardId),
      JSON.stringify({
        version: BOARD_DATA_VERSION,
        data,
      })
    )
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

// load board data from its per-board localStorage key
export const loadBoardFromStorage = (boardId: BoardId): BoardLoadResult =>
{
  try
  {
    const raw = readBrowserStorageItem(boardStorageKey(boardId))
    if (!raw)
    {
      return { status: 'missing', data: null }
    }

    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed))
    {
      return { status: 'corrupted', data: null }
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
        return { status: 'corrupted', data: null }
      }

      return {
        status: 'ok',
        data: parsed.data as Partial<BoardSnapshot>,
      }
    }

    return {
      status: 'ok',
      data: parsed as Partial<BoardSnapshot>,
    }
  }
  catch
  {
    return { status: 'corrupted', data: null }
  }
}

// remove a board's per-board localStorage key
export const removeBoardFromStorage = (boardId: BoardId): void =>
{
  deleteBrowserStorageItem(boardStorageKey(boardId))
}
