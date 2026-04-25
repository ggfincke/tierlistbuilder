// src/features/workspace/boards/model/session/boardSessionEvents.ts
// board session event hooks for model-level subscribers

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'

let boardLoadedListener: ((boardId: BoardId) => void) | null = null

export const notifyBoardLoaded = (boardId: BoardId): void =>
{
  boardLoadedListener?.(boardId)
}

export const setBoardLoadedListener = (
  listener: ((boardId: BoardId) => void) | null
): void =>
{
  boardLoadedListener = listener
}
