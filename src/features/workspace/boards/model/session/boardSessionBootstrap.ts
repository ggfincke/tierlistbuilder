// src/features/workspace/boards/model/session/boardSessionBootstrap.ts
// board session startup & registry pruning

import type { BoardMeta } from '@tierlistbuilder/contracts/workspace/board'
import {
  generateBoardId,
  type BoardId,
} from '@tierlistbuilder/contracts/lib/ids'
import {
  boardImageRefScope,
  loadBoardFromStorage,
  removeBoardFromStorage,
  saveBoardToStorage,
} from '~/features/workspace/boards/data/local/boardStorage'
import {
  BUILTIN_PRESETS,
  createBoardDataFromPreset,
} from '~/features/workspace/tier-presets/model/tierPresets'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { warmFromBoard } from '~/shared/images/imageBlobCache'
import {
  pruneUnreferencedBlobs,
  replaceBlobRefs,
} from '~/shared/images/imageStore'
import { collectSnapshotLocalImageHashes } from '~/shared/lib/boardSnapshotItems'
import { logger } from '~/shared/lib/logger'
import { pluralizeVerb, pluralizeWord } from '~/shared/lib/pluralize'
import { scheduleIdle } from '~/shared/lib/scheduleIdle'
import { toast } from '~/shared/notifications/useToastStore'
import {
  loadedBoardStateFromResult,
  loadBoardState,
} from './boardSessionPersistence'
import { createBoardMeta } from './boardSessionRegistry'

const pruneOrphanedRegistryEntriesAsync = (
  skipBoardId: BoardId | null
): void =>
{
  scheduleIdle(() =>
  {
    const boardStore = useWorkspaceBoardRegistryStore.getState()
    const healthy: BoardMeta[] = []
    let pruned = 0

    for (const meta of boardStore.boards)
    {
      if (meta.id === skipBoardId)
      {
        healthy.push(meta)
        continue
      }

      const result = loadBoardFromStorage(meta.id)

      if (result.status !== 'ok')
      {
        removeBoardFromStorage(meta.id)
        pruned++
        continue
      }

      healthy.push(meta)
    }

    if (pruned === 0)
    {
      return
    }

    const nextActiveId =
      healthy.find((b) => b.id === boardStore.activeBoardId)?.id ??
      healthy[0]?.id ??
      null
    boardStore.replaceRegistry(healthy, nextActiveId)
    toast(
      `${pruned} ${pluralizeWord(pruned, 'board')} had corrupted data and ${pluralizeVerb(pruned, 'was', 'were')} removed.`,
      'error'
    )
  })
}

const reconcileLocalImageRefsAsync = (): void =>
{
  scheduleIdle(() =>
  {
    void reconcileLocalImageRefs().catch((error) =>
    {
      logger.warn('image', 'Local image ref reconciliation failed:', error)
    })
  })
}

const reconcileLocalImageRefs = async (): Promise<void> =>
{
  const boardStore = useWorkspaceBoardRegistryStore.getState()

  for (const meta of boardStore.boards)
  {
    const result = loadBoardFromStorage(meta.id)
    const scope = boardImageRefScope(meta.id)
    const hashes =
      result.status === 'ok'
        ? collectSnapshotLocalImageHashes(loadedBoardStateFromResult(result))
        : []
    await replaceBlobRefs(scope, hashes)
  }

  await pruneUnreferencedBlobs()
}

const loadHealthyBoardSession = async (boardId: BoardId): Promise<boolean> =>
{
  const result = loadBoardFromStorage(boardId)

  if (result.status !== 'ok')
  {
    return false
  }

  const snapshot = loadedBoardStateFromResult(result)
  const boardStore = useWorkspaceBoardRegistryStore.getState()
  if (boardStore.activeBoardId !== boardId)
  {
    boardStore.setActiveBoardId(boardId)
  }
  await warmFromBoard(snapshot)
  loadBoardState(boardId, snapshot)
  pruneOrphanedRegistryEntriesAsync(boardId)
  reconcileLocalImageRefsAsync()
  return true
}

const tryLoadSiblingBoardSession = async (
  requestedActiveId: BoardId
): Promise<boolean> =>
{
  const boardStore = useWorkspaceBoardRegistryStore.getState()
  const siblingIds = boardStore.boards
    .map((board) => board.id)
    .filter((id) => id !== requestedActiveId)

  for (const siblingId of siblingIds)
  {
    if (await loadHealthyBoardSession(siblingId))
    {
      return true
    }

    removeBoardFromStorage(siblingId)
  }

  return false
}

export const bootstrapBoardSession = async (): Promise<void> =>
{
  const boardStore = useWorkspaceBoardRegistryStore.getState()
  const requestedActiveId =
    boardStore.activeBoardId ?? boardStore.boards[0]?.id ?? null

  if (requestedActiveId)
  {
    if (await loadHealthyBoardSession(requestedActiveId))
    {
      return
    }

    removeBoardFromStorage(requestedActiveId)
    toast('Board data was corrupted and has been reset.', 'error')

    if (await tryLoadSiblingBoardSession(requestedActiveId))
    {
      return
    }
  }

  const id = generateBoardId()
  const classicPreset = BUILTIN_PRESETS.find((p) => p.id === 'builtin-classic')!
  const data = createBoardDataFromPreset(classicPreset)
  saveBoardToStorage(id, data)
  boardStore.replaceRegistry([createBoardMeta(id, data.title)], id)
  await warmFromBoard(data)
  loadBoardState(id, data)
  reconcileLocalImageRefsAsync()
}
