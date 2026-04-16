// src/features/platform/sync/cloudPull.ts
// first-login cloud pull helpers for replace & resume flows

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type {
  BoardListItem,
  BoardMeta,
} from '@tierlistbuilder/contracts/workspace/board'
import { getBoardStatesByExternalIdsImperative } from '~/features/workspace/boards/data/cloud/boardRepository'
import { serverStateToSnapshot } from '~/features/workspace/boards/data/cloud/boardMapper'
import {
  loadBoardFromStorage,
  removeBoardFromStorage,
  saveBoardToStorage,
} from '~/features/workspace/boards/data/local/boardStorage'
import { loadBoardIntoSession } from '~/features/workspace/boards/data/local/localBoardSession'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { mapAsyncLimit } from '~/shared/lib/asyncMapLimit'
import { useCloudPullProgressStore } from './useCloudPullProgressStore'

const PULL_CONCURRENCY = 3
const PULL_BATCH_SIZE = 3

type PullMode = 'replace' | 'merge-missing'

export interface PullCloudBoardsOptions
{
  cloudBoards: BoardListItem[]
  mode: PullMode
  shouldProceed?: () => boolean
}

export type PullCloudBoardsResult =
  | {
      kind: 'success'
      attemptedCount: number
      pulledCount: number
      failedCount: number
      loadedBoardId: BoardId | null
    }
  | { kind: 'aborted' }

type PersistBoardResult =
  | { kind: 'success'; meta: BoardMeta }
  | { kind: 'failed' }
  | { kind: 'aborted' }

const shouldContinue = (shouldProceed?: () => boolean): boolean =>
  shouldProceed ? shouldProceed() : true

const getExistingCloudBoardExternalIds = (): Set<string> =>
{
  const ids = new Set<string>()

  for (const meta of useWorkspaceBoardRegistryStore.getState().boards)
  {
    const result = loadBoardFromStorage(meta.id)
    if (result.status !== 'ok') continue

    if (result.sync.cloudBoardExternalId)
    {
      ids.add(result.sync.cloudBoardExternalId)
    }
  }

  return ids
}

const selectBoardsToDownload = (
  cloudBoards: BoardListItem[],
  mode: PullMode
): BoardListItem[] =>
{
  if (mode === 'replace')
  {
    return cloudBoards
  }

  const existingIds = getExistingCloudBoardExternalIds()
  return cloudBoards.filter((board) => !existingIds.has(board.externalId))
}

const chunkBoards = (boards: BoardListItem[]): BoardListItem[][] =>
{
  const chunks: BoardListItem[][] = []

  for (let i = 0; i < boards.length; i += PULL_BATCH_SIZE)
  {
    chunks.push(boards.slice(i, i + PULL_BATCH_SIZE))
  }

  return chunks
}

const persistDownloadedBoard = async (
  meta: BoardListItem,
  state: Awaited<
    ReturnType<typeof getBoardStatesByExternalIdsImperative>
  >[number],
  shouldProceed?: () => boolean
): Promise<PersistBoardResult> =>
{
  if (!shouldContinue(shouldProceed))
  {
    return { kind: 'aborted' }
  }

  if (!state)
  {
    return { kind: 'failed' }
  }

  if (!shouldContinue(shouldProceed))
  {
    return { kind: 'aborted' }
  }

  const boardId = meta.externalId as BoardId
  const snapshot = serverStateToSnapshot(state)
  const saveResult = saveBoardToStorage(boardId, snapshot, {
    syncState: {
      lastSyncedRevision: state.revision,
      cloudBoardExternalId: meta.externalId,
    },
  })

  if (!saveResult.ok)
  {
    removeBoardFromStorage(boardId)
    console.warn(
      `Failed to persist cloud board ${meta.externalId}:`,
      saveResult.message
    )
    return { kind: 'failed' }
  }

  return {
    kind: 'success',
    meta: {
      id: boardId,
      title: snapshot.title,
      createdAt: meta.createdAt,
    },
  }
}

const cleanupPulledBoards = (metas: BoardMeta[]): void =>
{
  for (const meta of metas)
  {
    removeBoardFromStorage(meta.id)
  }
}

const replaceLocalRegistry = async (
  newMetas: BoardMeta[],
  shouldProceed?: () => boolean
): Promise<BoardId | null> =>
{
  const previousRegistry = [...useWorkspaceBoardRegistryStore.getState().boards]
  const firstId = newMetas[0]!.id

  await loadBoardIntoSession(firstId, shouldProceed)
  if (!shouldContinue(shouldProceed))
  {
    return null
  }

  useWorkspaceBoardRegistryStore.getState().replaceRegistry(newMetas, firstId)

  for (const stale of previousRegistry)
  {
    removeBoardFromStorage(stale.id)
  }

  return firstId
}

const mergeIntoLocalRegistry = async (
  newMetas: BoardMeta[],
  shouldProceed?: () => boolean
): Promise<BoardId | null> =>
{
  if (newMetas.length === 0)
  {
    return null
  }

  const registryStore = useWorkspaceBoardRegistryStore.getState()
  const existingBoards = [...registryStore.boards]
  const existingIds = new Set(existingBoards.map((board) => board.id))
  const mergedBoards = [...existingBoards]

  for (const meta of newMetas)
  {
    if (!existingIds.has(meta.id))
    {
      mergedBoards.push(meta)
      existingIds.add(meta.id)
    }
  }

  const nextActiveId = registryStore.activeBoardId || mergedBoards[0]?.id
  if (!nextActiveId)
  {
    return null
  }

  if (!registryStore.activeBoardId)
  {
    await loadBoardIntoSession(nextActiveId, shouldProceed)
    if (!shouldContinue(shouldProceed))
    {
      return null
    }
  }

  registryStore.replaceRegistry(mergedBoards, nextActiveId)

  return registryStore.activeBoardId ? null : nextActiveId
}

export const pullAllCloudBoards = async ({
  cloudBoards,
  mode,
  shouldProceed,
}: PullCloudBoardsOptions): Promise<PullCloudBoardsResult> =>
{
  if (!shouldContinue(shouldProceed))
  {
    return { kind: 'aborted' }
  }

  const boardsToDownload = selectBoardsToDownload(cloudBoards, mode)
  if (boardsToDownload.length === 0)
  {
    return {
      kind: 'success',
      attemptedCount: 0,
      pulledCount: 0,
      failedCount: 0,
      loadedBoardId: null,
    }
  }

  useCloudPullProgressStore.getState().start(boardsToDownload.length)

  let results: PersistBoardResult[]
  try
  {
    const boardChunks = chunkBoards(boardsToDownload)
    results = await mapAsyncLimit(
      boardChunks,
      PULL_CONCURRENCY,
      async (chunk) =>
      {
        try
        {
          const states = await getBoardStatesByExternalIdsImperative({
            boardExternalIds: chunk.map((meta) => meta.externalId),
          })

          const chunkResults: PersistBoardResult[] = []
          for (let index = 0; index < chunk.length; index++)
          {
            const result = await persistDownloadedBoard(
              chunk[index],
              states[index],
              shouldProceed
            )
            useCloudPullProgressStore.getState().bump()
            chunkResults.push(result)
          }

          return chunkResults
        }
        catch (error)
        {
          console.warn(
            `Failed to download cloud board batch: ${chunk.map((meta) => meta.externalId).join(', ')}`,
            error
          )

          return chunk.map<PersistBoardResult>((_meta) =>
          {
            useCloudPullProgressStore.getState().bump()
            return shouldContinue(shouldProceed)
              ? { kind: 'failed' }
              : { kind: 'aborted' }
          })
        }
      }
    ).then((chunks) => chunks.flat())
  }
  finally
  {
    useCloudPullProgressStore.getState().end()
  }

  const successful = results.flatMap((result) =>
    result.kind === 'success' ? [result.meta] : []
  )

  if (
    !shouldContinue(shouldProceed) ||
    results.some((result) => result.kind === 'aborted')
  )
  {
    cleanupPulledBoards(successful)
    return { kind: 'aborted' }
  }

  let loadedBoardId: BoardId | null = null
  if (successful.length > 0)
  {
    loadedBoardId =
      mode === 'replace'
        ? await replaceLocalRegistry(successful, shouldProceed)
        : await mergeIntoLocalRegistry(successful, shouldProceed)
  }

  if (!shouldContinue(shouldProceed))
  {
    cleanupPulledBoards(successful)
    return { kind: 'aborted' }
  }

  return {
    kind: 'success',
    attemptedCount: boardsToDownload.length,
    pulledCount: successful.length,
    failedCount: boardsToDownload.length - successful.length,
    loadedBoardId,
  }
}
