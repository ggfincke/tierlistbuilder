// src/features/workspace/boards/model/session/boardSessionCrud.ts
// board session create, switch, import, rename, duplicate, & delete actions

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type { TierPreset } from '@tierlistbuilder/contracts/workspace/tierPreset'
import {
  generateBoardId,
  type BoardId,
} from '@tierlistbuilder/contracts/lib/ids'
import { DEFAULT_TITLE } from '~/shared/board-data/boardDefaults'
import {
  normalizeBoardSnapshot,
  extractBoardData,
} from '~/shared/board-data/boardSnapshot'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import {
  loadBoardFromStorage,
  loadBoardSyncStateOnly,
  removeBoardFromStorage,
  saveBoardToStorage,
  type StorageWriteResult,
} from '~/features/workspace/boards/data/local/boardStorage'
import { stampPendingBoardDelete } from '~/features/workspace/boards/data/local/boardDeleteSyncMeta'
import { createBoardDataFromPreset } from '~/features/workspace/tier-presets/model/tierPresets'
import { warmFromBoard } from '~/shared/images/imageBlobCache'
import {
  extractBoardSyncState,
  markBoardPendingSync,
  type BoardSyncState,
} from '~/features/workspace/boards/model/sync'
import {
  createBoardMeta,
  deduplicateBoardTitle,
  getActivePaletteId,
} from '~/features/workspace/boards/model/session/boardSessionRegistry'
import {
  loadedBoardStateFromResult,
  loadBoardIntoSession,
  loadBoardState,
  saveActiveBoardSnapshot,
} from '~/features/workspace/boards/model/session/boardSessionPersistence'
import {
  notifyBoardChanged,
  notifyBoardDeleted,
} from '~/features/workspace/boards/model/session/boardSessionEvents'

const createBlankBoardData = (): BoardSnapshot => ({
  title: DEFAULT_TITLE,
  tiers: [],
  unrankedItemIds: [],
  items: {},
  deletedItems: [],
})

const saveAndActivateBoard = async (
  data: BoardSnapshot,
  titleHint: string,
  syncState: BoardSyncState | null = null
): Promise<BoardId> =>
{
  const boardStore = useWorkspaceBoardRegistryStore.getState()
  const id = generateBoardId()
  const title = deduplicateBoardTitle(titleHint, boardStore.boards)
  const normalized = normalizeBoardSnapshot(
    { ...data, title },
    getActivePaletteId(),
    title
  )

  await warmFromBoard(normalized)
  const nextSyncState = syncState ?? undefined
  saveBoardToStorage(id, normalized, { syncState: nextSyncState })
  useWorkspaceBoardRegistryStore
    .getState()
    .addBoardMeta(createBoardMeta(id, title), true)
  loadBoardState(id, normalized, nextSyncState)
  return id
}

const loadInactiveBoardSnapshot = (boardId: BoardId): BoardSnapshot =>
{
  const persisted = loadBoardFromStorage(boardId)
  if (persisted.status !== 'ok')
  {
    throw new Error(`board snapshot is not available: ${boardId}`)
  }
  return loadedBoardStateFromResult(persisted).snapshot
}

const saveInactiveBoardTitle = (boardId: BoardId, title: string): boolean =>
{
  const persisted = loadBoardFromStorage(boardId)
  if (persisted.status !== 'ok')
  {
    return false
  }

  const { snapshot, syncState } = loadedBoardStateFromResult(persisted)
  if (snapshot.title === title)
  {
    return true
  }

  const nextSyncState = markBoardPendingSync(syncState)
  const saveResult = saveBoardToStorage(
    boardId,
    { ...snapshot, title },
    { syncState: nextSyncState }
  )
  if (!saveResult.ok)
  {
    return false
  }

  notifyBoardChanged(boardId)
  return true
}

export const createBoardSession = async (): Promise<void> =>
{
  saveActiveBoardSnapshot()
  await saveAndActivateBoard(createBlankBoardData(), DEFAULT_TITLE)
}

export const createBoardSessionFromPreset = async (
  preset: TierPreset
): Promise<void> =>
{
  saveActiveBoardSnapshot()
  const data = createBoardDataFromPreset(preset)
  await saveAndActivateBoard(data, DEFAULT_TITLE)
}

export const switchBoardSession = async (boardId: BoardId): Promise<void> =>
{
  const boardStore = useWorkspaceBoardRegistryStore.getState()

  if (boardId === boardStore.activeBoardId)
  {
    return
  }

  if (!boardStore.boards.some((board) => board.id === boardId))
  {
    return
  }

  useActiveBoardStore.getState().discardDragPreview()
  saveActiveBoardSnapshot()
  boardStore.setActiveBoardId(boardId)
  await loadBoardIntoSession(boardId)
}

export const deleteBoardSession = async (boardId: BoardId): Promise<void> =>
{
  const boardStore = useWorkspaceBoardRegistryStore.getState()

  if (boardStore.boards.length <= 1)
  {
    useActiveBoardStore
      .getState()
      .setRuntimeError('At least one list must remain.')
    return
  }

  const cloudBoardExternalId =
    loadBoardSyncStateOnly(boardId).cloudBoardExternalId

  removeBoardFromStorage(boardId)
  const nextBoards = boardStore.boards.filter((board) => board.id !== boardId)

  if (cloudBoardExternalId)
  {
    stampPendingBoardDelete(cloudBoardExternalId)
    notifyBoardDeleted()
  }

  if (boardId === boardStore.activeBoardId)
  {
    const nextActiveId = nextBoards[0].id
    boardStore.replaceRegistry(nextBoards, nextActiveId)
    await loadBoardIntoSession(nextActiveId)
    return
  }

  boardStore.removeBoardMeta(boardId)
}

export const duplicateBoardSession = async (
  boardId: BoardId
): Promise<void> =>
{
  const boardStore = useWorkspaceBoardRegistryStore.getState()

  if (!boardStore.boards.some((board) => board.id === boardId))
  {
    return
  }

  saveActiveBoardSnapshot()

  const source =
    boardId === boardStore.activeBoardId
      ? extractBoardData(useActiveBoardStore.getState())
      : loadInactiveBoardSnapshot(boardId)

  await saveAndActivateBoard(
    source,
    source.title || DEFAULT_TITLE,
    markBoardPendingSync({
      lastSyncedRevision: null,
      cloudBoardExternalId: null,
      pendingSyncAt: null,
    })
  )
}

export const renameBoardSession = (
  boardId: BoardId,
  title: string
): StorageWriteResult =>
{
  const trimmed = title.trim()

  if (!trimmed)
  {
    return { ok: true }
  }

  const boardStore = useWorkspaceBoardRegistryStore.getState()
  boardStore.renameBoardMeta(boardId, trimmed)

  if (boardId === boardStore.activeBoardId)
  {
    const state = useActiveBoardStore.getState()
    if (state.title === trimmed)
    {
      return { ok: true }
    }

    const syncState = markBoardPendingSync(extractBoardSyncState(state))
    useActiveBoardStore.setState({ title: trimmed, ...syncState })
    const saveResult = saveBoardToStorage(
      boardId,
      { ...extractBoardData(useActiveBoardStore.getState()), title: trimmed },
      { syncState }
    )
    if (!saveResult.ok)
    {
      useActiveBoardStore.getState().setRuntimeError(saveResult.message)
      return saveResult
    }
    notifyBoardChanged(boardId)
    return { ok: true }
  }

  if (!saveInactiveBoardTitle(boardId, trimmed))
  {
    throw new Error(`failed to persist renamed board ${boardId}`)
  }
  return { ok: true }
}

export const importBoardSession = async (
  data: BoardSnapshot
): Promise<void> =>
{
  saveActiveBoardSnapshot()
  await saveAndActivateBoard(data, data.title || DEFAULT_TITLE)
}

export const importBoardsSession = async (
  boards: BoardSnapshot[]
): Promise<void> =>
{
  if (boards.length === 0)
  {
    return
  }

  saveActiveBoardSnapshot()

  const boardStore = useWorkspaceBoardRegistryStore.getState()
  const nextBoards = boardStore.boards.slice()
  let lastId = boardStore.activeBoardId

  for (const board of boards)
  {
    const id = generateBoardId()
    const title = deduplicateBoardTitle(
      board.title || DEFAULT_TITLE,
      nextBoards
    )
    const normalized = normalizeBoardSnapshot(
      { ...board, title },
      getActivePaletteId(),
      title
    )

    saveBoardToStorage(id, normalized)
    nextBoards.push(createBoardMeta(id, title))
    lastId = id
  }

  if (!lastId)
  {
    return
  }

  useWorkspaceBoardRegistryStore.getState().replaceRegistry(nextBoards, lastId)
  await loadBoardIntoSession(lastId)
}
