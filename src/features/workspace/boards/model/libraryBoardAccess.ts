// src/features/workspace/boards/model/libraryBoardAccess.ts
// model facade for my boards library reads & cloud-only deletes

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import { deleteBoardImperative } from '~/features/workspace/boards/data/cloud/boardRepository'
import { loadBoardFromStorage } from '~/features/workspace/boards/data/local/boardStorage'

export const readBoardSnapshotForLibrary = (
  boardId: BoardId
): Partial<BoardSnapshot> | null =>
{
  const loaded = loadBoardFromStorage(boardId)
  return loaded.status === 'ok' ? loaded.data : null
}

export const deleteLibraryBoard = async (boardId: BoardId): Promise<void> =>
{
  await deleteBoardImperative({ boardExternalId: boardId })
}
