// src/features/workspace/boards/data/cloud/cloudPull.ts
// first-login cloud pull helpers for replace & resume flows

import { asBoardId, type BoardId } from '@tierlistbuilder/contracts/lib/ids'
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
import { markBoardSynced } from '~/features/workspace/boards/model/sync'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { mapAsyncLimit } from '~/shared/lib/asyncMapLimit'
import { makeProceedGuard } from '~/shared/lib/sync/proceedGuard'
import { useCloudPullProgressStore } from '~/features/platform/sync/state/useCloudPullProgressStore'
import { SYNC_CONCURRENCY } from '~/features/platform/sync/lib/concurrency'
import { logger } from '~/shared/lib/logger'

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

  for (let i = 0; i < boards.length; i += SYNC_CONCURRENCY.pullBatch)
  {
    chunks.push(boards.slice(i, i + SYNC_CONCURRENCY.pullBatch))
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
  const canProceed = makeProceedGuard(shouldProceed)

  if (!canProceed())
  {
    return { kind: 'aborted' }
  }

  if (!state)
  {
    return { kind: 'failed' }
  }

  if (!canProceed())
  {
    return { kind: 'aborted' }
  }

  const boardId = asBoardId(meta.externalId)
  const snapshot = serverStateToSnapshot(state)
  const saveResult = saveBoardToStorage(boardId, snapshot, {
    syncState: markBoardSynced(state.revision, meta.externalId),
  })

  if (!saveResult.ok)
  {
    removeBoardFromStorage(boardId)
    logger.warn(
      'sync',
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
  const canProceed = makeProceedGuard(shouldProceed)
  const previousRegistry = [...useWorkspaceBoardRegistryStore.getState().boards]
  const firstId = newMetas[0]!.id

  await loadBoardIntoSession(firstId, shouldProceed)
  if (!canProceed())
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

  const canProceed = makeProceedGuard(shouldProceed)
  const registryStore = useWorkspaceBoardRegistryStore.getState()
  const hadActiveBoard = Boolean(registryStore.activeBoardId)
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

  // only load a board into session when we didn't already have an active one;
  // otherwise the caller stays on the current board & we just extend the
  // registry w/ newly-merged cloud metas
  let loadedBoardId: BoardId | null = null
  if (!hadActiveBoard)
  {
    await loadBoardIntoSession(nextActiveId, shouldProceed)
    if (!canProceed())
    {
      return null
    }
    loadedBoardId = nextActiveId
  }

  registryStore.replaceRegistry(mergedBoards, nextActiveId)

  return loadedBoardId
}

export const pullAllCloudBoards = async ({
  cloudBoards,
  mode,
  shouldProceed,
}: PullCloudBoardsOptions): Promise<PullCloudBoardsResult> =>
{
  const canProceed = makeProceedGuard(shouldProceed)

  if (!canProceed())
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
      SYNC_CONCURRENCY.pull,
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
          logger.warn(
            'sync',
            `Failed to download cloud board batch: ${chunk.map((meta) => meta.externalId).join(', ')}`,
            error
          )

          return chunk.map<PersistBoardResult>((_meta) =>
          {
            useCloudPullProgressStore.getState().bump()
            return canProceed() ? { kind: 'failed' } : { kind: 'aborted' }
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

  if (!canProceed() || results.some((result) => result.kind === 'aborted'))
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

  if (!canProceed())
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
