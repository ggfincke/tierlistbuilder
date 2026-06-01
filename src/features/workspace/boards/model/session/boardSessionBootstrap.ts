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
import { pruneUnreferencedBlobs } from '~/shared/images/imageBlobGc'
import { replaceBlobRefs } from '~/shared/images/imageBlobRefStore'
import { collectSnapshotLocalImageHashes } from '~/shared/lib/boardSnapshotItems'
import { logger } from '~/shared/lib/logger'
import { formatCountedWord, pluralizeWord } from '~/shared/lib/pluralize'
import { toast } from '~/shared/notifications/useToastStore'
import {
  loadedBoardStateFromResult,
  loadBoardState,
} from '~/features/workspace/boards/model/session/boardSessionPersistence'
import { createBoardMeta } from '~/features/workspace/boards/model/session/boardSessionRegistry'

const scheduleIdle = (callback: () => void, timeout = 2_000): void =>
{
  if (
    typeof window !== 'undefined' &&
    typeof window.requestIdleCallback === 'function'
  )
  {
    window.requestIdleCallback(callback, { timeout })
    return
  }

  setTimeout(callback, 0)
}

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
      `${formatCountedWord(pruned, 'board')} had corrupted data and ${pluralizeWord(pruned, 'was', 'were')} removed.`,
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
        ? collectSnapshotLocalImageHashes(
            loadedBoardStateFromResult(result).snapshot
          )
        : []
    await replaceBlobRefs(scope, hashes)
  }

  await pruneUnreferencedBlobs()
}

export const bootstrapBoardSession = async (): Promise<void> =>
{
  const boardStore = useWorkspaceBoardRegistryStore.getState()
  const requestedActiveId =
    boardStore.activeBoardId ?? boardStore.boards[0]?.id ?? null

  // walk requested-active first, then the rest of the registry; on corruption
  // fall through to the next candidate. async pruner emits the toast.
  const candidates: BoardId[] = []
  const seen = new Set<BoardId>()
  if (requestedActiveId)
  {
    candidates.push(requestedActiveId)
    seen.add(requestedActiveId)
  }
  for (const meta of boardStore.boards)
  {
    if (seen.has(meta.id)) continue
    seen.add(meta.id)
    candidates.push(meta.id)
  }

  for (const candidateId of candidates)
  {
    const result = loadBoardFromStorage(candidateId)
    if (result.status !== 'ok')
    {
      removeBoardFromStorage(candidateId)
      continue
    }

    const state = loadedBoardStateFromResult(result)
    if (boardStore.activeBoardId !== candidateId)
    {
      boardStore.setActiveBoardId(candidateId)
    }
    await warmFromBoard(state.snapshot)
    loadBoardState(candidateId, state.snapshot, state.syncState)
    pruneOrphanedRegistryEntriesAsync(candidateId)
    reconcileLocalImageRefsAsync()
    return
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
