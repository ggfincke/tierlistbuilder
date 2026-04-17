// src/features/platform/sync/cloudRestore.ts
// per-board restore helper for the "Recently deleted" surface. mirrors the
// single-board persist logic in cloudPull's pullAllCloudBoards but operates
// on one boardExternalId at a time & assumes the row's deletedAt has just
// been cleared by restoreBoardImperative.
//
// the local boardId mirrors the cloud externalId — same convention the
// initial cloud-pull uses, so a restored board slots back into the
// registry under the identifier it had before deletion (if any local
// trace remained) or under its cloud identifier (if local data was wiped)

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { BoardMeta } from '@tierlistbuilder/contracts/workspace/board'
import {
  getBoardStateByExternalIdImperative,
  restoreBoardImperative,
} from '~/features/workspace/boards/data/cloud/boardRepository'
import { serverStateToSnapshot } from '~/features/workspace/boards/data/cloud/boardMapper'
import { saveBoardToStorage } from '~/features/workspace/boards/data/local/boardStorage'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'

export type RestoreErrorCode =
  | 'concurrent-hard-delete'
  | 'persist-failed'
  | 'cloud-error'

// typed restore error so callers map to user-friendly toast text. the raw
// error text (w/ external IDs) stays on the cause field for console logging
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

// restore a soft-deleted cloud board to active status & materialize its
// state locally. throws on any leg of the flow so the caller surfaces a
// single error path; partial-state recovery is the caller's concern (UI
// shows the row stays in the deleted list w/ a retry option)
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

  const boardId = boardExternalId as BoardId
  const snapshot = serverStateToSnapshot(cloudState)

  const saveResult = saveBoardToStorage(boardId, snapshot, {
    syncState: {
      lastSyncedRevision: cloudState.revision,
      cloudBoardExternalId: boardExternalId,
      pendingSyncAt: null,
    },
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

  // CloudBoardState carries title + revision + rows but not the createdAt
  // timestamp; restore is rare enough that re-stamping w/ now() is fine
  // (the registry's createdAt only drives display order, not anything
  // user-visible). avoids needing a second imperative query
  const meta: BoardMeta = {
    id: boardId,
    title: snapshot.title,
    createdAt: Date.now(),
  }
  registryStore.addBoardMeta(meta, false)

  return { meta, alreadyInRegistry: false }
}
