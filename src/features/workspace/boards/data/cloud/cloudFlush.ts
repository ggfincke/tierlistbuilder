// src/features/workspace/boards/data/cloud/cloudFlush.ts
// shared helpers for reading local board state & pushing it to the cloud

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type { CloudBoardState } from '@tierlistbuilder/contracts/workspace/cloudBoard'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { extractBoardData } from '~/shared/board-data/boardSnapshot'
import {
  extractBoardSyncState,
  type BoardSyncState,
} from '~/features/workspace/boards/model/sync'
import {
  getBoardStateByExternalIdImperative,
  upsertBoardStateImperative,
} from '~/features/workspace/boards/data/cloud/boardRepository'
import { snapshotToCloudPayload } from '~/features/workspace/boards/data/cloud/boardMapper'
import { uploadBoardImages } from '~/features/platform/media/imageUploader'
import { loadPersistedBoardState } from '~/features/workspace/boards/model/boardSession'
import {
  classifySyncError,
  type SyncError,
} from '~/features/platform/sync/lib/errors'

// read unsaved active-board edits before falling back to storage
export const readBoardStateForCloudSync = (
  boardId: BoardId
): {
  snapshot: BoardSnapshot
  syncState: BoardSyncState
} =>
{
  if (useWorkspaceBoardRegistryStore.getState().activeBoardId === boardId)
  {
    const state = useActiveBoardStore.getState()

    return {
      snapshot: extractBoardData(state),
      syncState: extractBoardSyncState(state),
    }
  }

  return loadPersistedBoardState(boardId)
}

// callers only advance sync state on the synced variant. `error` is pre-
// classified so schedulers can short-circuit permanent failures via
// `error.permanent` instead of retrying forever
export type FlushBoardOutcome =
  | { kind: 'synced'; revision: number }
  | { kind: 'conflict'; serverState: CloudBoardState }
  | { kind: 'error'; error: SyncError }

export const flushBoardToCloud = async (
  snapshot: BoardSnapshot,
  boardExternalId: string,
  baseRevision: number | null,
  userId: string
): Promise<FlushBoardOutcome> =>
{
  try
  {
    const uploadResult = await uploadBoardImages(snapshot, userId)
    const payload = snapshotToCloudPayload(snapshot, uploadResult)

    const result = await upsertBoardStateImperative({
      ...payload,
      boardExternalId,
      baseRevision,
    })

    if (result.conflict)
    {
      // conflict response is revision-only; fetch the full server state now
      // so the conflict UI has everything it needs. the extra round-trip is
      // rare (only on OCC mismatch) & saves a full-row load on the common path
      const serverState = await getBoardStateByExternalIdImperative({
        boardExternalId,
      })
      if (!serverState)
      {
        return {
          kind: 'error',
          error: classifySyncError(
            new Error(
              'conflict reported but server state missing: ' + boardExternalId
            )
          ),
        }
      }
      return { kind: 'conflict', serverState }
    }

    return { kind: 'synced', revision: result.newRevision }
  }
  catch (error)
  {
    return { kind: 'error', error: classifySyncError(error) }
  }
}
