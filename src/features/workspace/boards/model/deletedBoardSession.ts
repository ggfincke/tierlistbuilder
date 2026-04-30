// src/features/workspace/boards/model/deletedBoardSession.ts
// model facade for cloud-backed recently deleted board actions

import { asBoardId } from '@tierlistbuilder/contracts/lib/ids'
import type {
  BoardMeta,
  DeletedBoardListItem,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  getBoardStateByExternalIdImperative,
  permanentlyDeleteBoardImperative,
  restoreBoardImperative,
  useListMyDeletedBoards,
} from '~/features/workspace/boards/data/cloud/boardRepository'
import { serverStateToSnapshot } from '~/features/workspace/boards/data/cloud/boardMapper'
import { saveBoardToStorage } from '~/features/workspace/boards/data/local/boardStorage'
import { markBoardSynced } from '~/features/workspace/boards/model/sync'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { RestoreBoardError } from '~/features/platform/sync/lib/errors'

export { RestoreBoardError }
export type { RestoreErrorCode } from '~/features/platform/sync/lib/errors'

export interface RestoredBoard
{
  meta: BoardMeta
  alreadyInRegistry: boolean
}

export const useDeletedBoardSessions = (
  enabled: boolean
): DeletedBoardListItem[] | undefined => useListMyDeletedBoards(enabled)

export const permanentlyDeleteDeletedBoardSession = (boardExternalId: string) =>
  permanentlyDeleteBoardImperative({ boardExternalId })

export const restoreDeletedBoardSession = async (
  boardExternalId: string
): Promise<RestoredBoard> =>
{
  try
  {
    await restoreBoardImperative({ boardExternalId })
  }
  catch (error)
  {
    throw new RestoreBoardError(
      'cloud-error',
      `restore mutation failed for ${boardExternalId}`,
      error
    )
  }

  const cloudState = await getBoardStateByExternalIdImperative({
    boardExternalId,
  })
  if (!cloudState)
  {
    throw new RestoreBoardError(
      'concurrent-hard-delete',
      `restored board ${boardExternalId} returned no state`
    )
  }

  const boardId = asBoardId(boardExternalId)
  const snapshot = serverStateToSnapshot(cloudState)
  const saveResult = saveBoardToStorage(boardId, snapshot, {
    syncState: markBoardSynced(cloudState.revision, boardExternalId),
  })

  if (!saveResult.ok)
  {
    throw new RestoreBoardError(
      'persist-failed',
      `failed to persist restored board ${boardExternalId}: ${saveResult.message}`
    )
  }

  const registryStore = useWorkspaceBoardRegistryStore.getState()
  const existing = registryStore.boards.find((b) => b.id === boardId)
  if (existing)
  {
    return {
      meta: existing,
      alreadyInRegistry: true,
    }
  }

  const meta: BoardMeta = {
    id: boardId,
    title: snapshot.title,
    createdAt: Date.now(),
  }
  registryStore.addBoardMeta(meta, false)

  return { meta, alreadyInRegistry: false }
}
