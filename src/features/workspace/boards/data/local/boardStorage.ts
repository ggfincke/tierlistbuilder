// src/features/workspace/boards/data/local/boardStorage.ts
// board localStorage I/O for persisted board payloads

import type { BoardSnapshot } from '@/features/workspace/boards/model/contract'
import type { BoardId } from '@/shared/types/ids'
import {
  deleteBrowserStorageItem,
  getBrowserStorage,
  readBrowserStorageItem,
} from '@/shared/lib/browserStorage'

// current board payload schema version
export const BOARD_DATA_VERSION = 3

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

// check whether an error is a storage quota exceeded error
const isQuotaError = (error: unknown): boolean =>
  error instanceof DOMException &&
  (error.name === 'QuotaExceededError' ||
    error.code === 22 ||
    error.code === 1014)

// check whether a parsed value is a plain object we can treat as board data
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

// unwrap either a raw board payload or a versioned envelope
const extractBoardPayload = (
  parsed: unknown
): Partial<BoardSnapshot> | null =>
{
  if (!isRecord(parsed))
  {
    return null
  }

  if ('data' in parsed)
  {
    return isRecord(parsed.data)
      ? (parsed.data as Partial<BoardSnapshot>)
      : null
  }

  return parsed as Partial<BoardSnapshot>
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
      isQuotaError(error)
        ? 'Storage is full. Delete unused boards or remove items with large images to free space.'
        : 'Could not save changes to localStorage. Free up browser storage and try again.'
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

    const parsed = JSON.parse(raw)
    const data = extractBoardPayload(parsed)

    if (!data)
    {
      return { status: 'corrupted', data: null }
    }

    return { status: 'ok', data }
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
