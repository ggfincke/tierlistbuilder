// src/features/workspace/boards/model/session/boardSessionEvents.ts
// board session event hooks consumed by sync orchestration

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'

let boardLoadedListener: ((boardId: BoardId) => void) | null = null
let boardDeletedListener: (() => void) | null = null

export const notifyBoardLoaded = (boardId: BoardId): void =>
{
  boardLoadedListener?.(boardId)
}

export const notifyBoardDeleted = (): void =>
{
  boardDeletedListener?.()
}

export const setBoardLoadedListener = (
  listener: ((boardId: BoardId) => void) | null
): void =>
{
  boardLoadedListener = listener
}

export const setBoardDeletedListener = (
  listener: (() => void) | null
): void =>
{
  boardDeletedListener = listener
}
