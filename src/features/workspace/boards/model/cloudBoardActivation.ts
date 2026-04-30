// src/features/workspace/boards/model/cloudBoardActivation.ts
// activates cloud-backed boards in the local workspace session

import { asBoardId, type BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { getBoardStateByExternalIdImperative } from '~/features/workspace/boards/data/cloud/boardRepository'
import { serverStateToSnapshot } from '~/features/workspace/boards/data/cloud/boardMapper'
import { saveBoardToStorage } from '~/features/workspace/boards/data/local/boardStorage'
import { markBoardSynced } from '~/features/workspace/boards/model/sync'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { switchBoardSession } from '~/features/workspace/boards/model/boardSession'
import {
  loadBoardState,
  saveActiveBoardSnapshot,
} from '~/features/workspace/boards/model/session/boardSessionPersistence'
import { warmFromBoard } from '~/shared/images/imageBlobCache'

export type CloudBoardActivationErrorKind = 'cloud-missing' | 'persist-failed'

export class CloudBoardActivationError extends Error
{
  readonly kind: CloudBoardActivationErrorKind

  constructor(kind: CloudBoardActivationErrorKind, message: string)
  {
    super(message)
    this.kind = kind
    this.name = 'CloudBoardActivationError'
  }
}

// fetch the cloud state for `boardExternalId`, persist a local snapshot keyed
// by the same id, & insert/activate a registry entry. resolves to the local
// BoardId callers should set as active prior to navigating into the workspace
export const importCloudBoardAsActive = async (
  boardExternalId: string
): Promise<BoardId> =>
{
  const cloudState = await getBoardStateByExternalIdImperative({
    boardExternalId,
  })
  if (!cloudState)
  {
    throw new CloudBoardActivationError(
      'cloud-missing',
      `cloud board ${boardExternalId} returned no state`
    )
  }

  const boardId = asBoardId(boardExternalId)
  const snapshot = serverStateToSnapshot(cloudState)
  const syncState = markBoardSynced(cloudState.revision, boardExternalId)
  const saveResult = saveBoardToStorage(boardId, snapshot, { syncState })

  if (!saveResult.ok)
  {
    throw new CloudBoardActivationError(
      'persist-failed',
      `failed to persist cloud board ${boardExternalId}: ${saveResult.message}`
    )
  }

  // persist whatever the user had open before swapping; loadBoardState then
  // populates useActiveBoardStore so a remount of WorkspaceShell renders the
  // newly-cloned board instead of the prior session's stale data
  useActiveBoardStore.getState().discardDragPreview()
  saveActiveBoardSnapshot()

  const registry = useWorkspaceBoardRegistryStore.getState()
  const existing = registry.boards.find((b) => b.id === boardId)
  if (!existing)
  {
    registry.addBoardMeta(
      { id: boardId, title: snapshot.title, createdAt: Date.now() },
      true
    )
  }
  else
  {
    registry.setActiveBoardId(boardId)
  }

  await warmFromBoard(snapshot)
  loadBoardState(boardId, snapshot, syncState)

  return boardId
}

export const activateCloudBoardAsActive = async (
  boardExternalId: string
): Promise<BoardId> =>
{
  const boardId = asBoardId(boardExternalId)
  const registry = useWorkspaceBoardRegistryStore.getState()
  const existing = registry.boards.find((b) => b.id === boardId)

  if (!existing)
  {
    return await importCloudBoardAsActive(boardExternalId)
  }

  if (registry.activeBoardId === boardId)
  {
    return boardId
  }

  await switchBoardSession(boardId)
  return boardId
}
