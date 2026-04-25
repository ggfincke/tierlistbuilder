// src/features/workspace/boards/model/session/boardSessionCrud.ts
// board session create, switch, import, rename, duplicate, & delete actions

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type { TierPreset } from '@tierlistbuilder/contracts/workspace/tierPreset'
import {
  generateBoardId,
  type BoardId,
} from '@tierlistbuilder/contracts/lib/ids'
import { DEFAULT_TITLE } from '~/features/workspace/boards/lib/boardDefaults'
import {
  normalizeBoardSnapshot,
  extractBoardData,
} from '~/features/workspace/boards/model/boardSnapshot'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import {
  removeBoardFromStorage,
  saveBoardToStorage,
} from '~/features/workspace/boards/data/local/boardStorage'
import { createBoardDataFromPreset } from '~/features/workspace/tier-presets/model/tierPresets'
import { warmFromBoard } from '~/shared/images/imageBlobCache'
import {
  createBoardMeta,
  deduplicateBoardTitle,
  getActivePaletteId,
} from './boardSessionRegistry'
import {
  loadBoardIntoSession,
  loadBoardState,
  loadPersistedBoard,
  saveActiveBoardSnapshot,
} from './boardSessionPersistence'

const createBlankBoardData = (): BoardSnapshot => ({
  title: DEFAULT_TITLE,
  tiers: [],
  unrankedItemIds: [],
  items: {},
  deletedItems: [],
})

const saveAndActivateBoard = async (
  data: BoardSnapshot,
  titleHint: string
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
  saveBoardToStorage(id, normalized)
  useWorkspaceBoardRegistryStore
    .getState()
    .addBoardMeta(createBoardMeta(id, title), true)
  loadBoardState(id, normalized)
  return id
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

  removeBoardFromStorage(boardId)
  const nextBoards = boardStore.boards.filter((board) => board.id !== boardId)

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
      : loadPersistedBoard(boardId)

  await saveAndActivateBoard(source, source.title || DEFAULT_TITLE)
}

export const renameBoardSession = (boardId: BoardId, title: string): void =>
{
  const trimmed = title.trim()

  if (!trimmed)
  {
    return
  }

  const boardStore = useWorkspaceBoardRegistryStore.getState()
  boardStore.renameBoardMeta(boardId, trimmed)

  if (boardId === boardStore.activeBoardId)
  {
    useActiveBoardStore.setState({ title: trimmed })
  }
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
