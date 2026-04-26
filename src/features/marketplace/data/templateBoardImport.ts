// src/features/marketplace/data/templateBoardImport.ts
// pulls a freshly-cloned cloud board into the local registry & activates it
// so the workspace mounts on it after navigation

import { asBoardId, type BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { getBoardStateByExternalIdImperative } from '~/features/workspace/boards/data/cloud/boardRepository'
import { serverStateToSnapshot } from '~/features/workspace/boards/data/cloud/boardMapper'
import { saveBoardToStorage } from '~/features/workspace/boards/data/local/boardStorage'
import { markBoardSynced } from '~/features/workspace/boards/model/sync'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import {
  loadBoardState,
  saveActiveBoardSnapshot,
} from '~/features/workspace/boards/model/session/boardSessionPersistence'
import { warmFromBoard } from '~/shared/images/imageBlobCache'

export type TemplateBoardImportErrorKind = 'cloud-missing' | 'persist-failed'

export class TemplateBoardImportError extends Error
{
  readonly kind: TemplateBoardImportErrorKind

  constructor(kind: TemplateBoardImportErrorKind, message: string)
  {
    super(message)
    this.kind = kind
    this.name = 'TemplateBoardImportError'
  }
}

// fetch the cloud state for `boardExternalId`, persist a local snapshot keyed
// by the same id, & insert/activate a registry entry. resolves to the local
// BoardId callers should set as active prior to navigating into the workspace
export const importTemplateBoardAsActive = async (
  boardExternalId: string
): Promise<BoardId> =>
{
  const cloudState = await getBoardStateByExternalIdImperative({
    boardExternalId,
  })
  if (!cloudState)
  {
    throw new TemplateBoardImportError(
      'cloud-missing',
      `template-cloned board ${boardExternalId} returned no state`
    )
  }

  const boardId = asBoardId(boardExternalId)
  const snapshot = serverStateToSnapshot(cloudState)
  const syncState = markBoardSynced(cloudState.revision, boardExternalId)
  const saveResult = saveBoardToStorage(boardId, snapshot, { syncState })

  if (!saveResult.ok)
  {
    throw new TemplateBoardImportError(
      'persist-failed',
      `failed to persist template-cloned board ${boardExternalId}: ${saveResult.message}`
    )
  }

  // persist whatever the user had open before swapping; loadBoardState then
  // populates useActiveBoardStore so a remount of WorkspaceShell renders the
  // newly-cloned board instead of the prior session's stale data
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
