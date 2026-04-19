// src/features/platform/sync/boards/cloudRestore.ts
// per-board restore helper for the "Recently deleted" surface. boardId mirrors
// cloud externalId so restored boards slot back under their pre-deletion id

import { asBoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { BoardMeta } from '@tierlistbuilder/contracts/workspace/board'
import {
  getBoardStateByExternalIdImperative,
  restoreBoardImperative,
} from '~/features/workspace/boards/data/cloud/boardRepository'
import { serverStateToSnapshot } from '~/features/workspace/boards/data/cloud/boardMapper'
import { saveBoardToStorage } from '~/features/workspace/boards/data/local/boardStorage'
import { markBoardSynced } from '~/features/workspace/boards/model/sync'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'

export type RestoreErrorCode =
  | 'concurrent-hard-delete'
  | 'persist-failed'
  | 'cloud-error'

// typed restore error for user-friendly toast mapping; raw error stays on cause
export class RestoreBoardError extends Error
{
  readonly code: RestoreErrorCode

  constructor(code: RestoreErrorCode, message: string, cause?: unknown)
  {
    super(message)
    this.name = 'RestoreBoardError'
    this.code = code
    if (cause !== undefined)
    {
      ;(this as { cause?: unknown }).cause = cause
    }
  }
}

export interface RestoredBoard
{
  meta: BoardMeta
  // true when the board was already in the local registry (e.g. another
  // device synced its restore first). caller may want to surface a
  // different toast in that case
  alreadyInRegistry: boolean
}

// restore a soft-deleted cloud board & materialize it locally. throws on
// any leg so the caller handles a single error path (UI shows retry option)
export const restoreBoardFromCloud = async (
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
      `restored board ${boardExternalId} returned no state — hard-deleted concurrently`
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

  // CloudBoardState has no createdAt; re-stamp w/ now() — registry's
  // createdAt only drives display order, so this is safe & avoids a second query
  const meta: BoardMeta = {
    id: boardId,
    title: snapshot.title,
    createdAt: Date.now(),
  }
  registryStore.addBoardMeta(meta, false)

  return { meta, alreadyInRegistry: false }
}
