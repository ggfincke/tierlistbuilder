// src/services/boardSession.ts
// board session service — bootstrap, autosave, storage I/O, & registry orchestration

import type { BoardMeta, PaletteId, TierListData, TierPreset } from '../types'
import { DEFAULT_TITLE } from '../utils/constants'
import {
  loadBoardFromStorage,
  migrateLegacyBoard,
  migrateStorageKeys,
  removeBoardFromStorage,
  saveBoardToStorage,
} from '../utils/storage'
import { THEME_PALETTE } from '../theme'
import { normalizeTierListData } from '../domain/boardData'
import { createBoardDataFromPreset } from '../domain/presets'
import { useBoardManagerStore } from '../store/useBoardManagerStore'
import { extractBoardData, useTierListStore } from '../store/useTierListStore'
import { useSettingsStore } from '../store/useSettingsStore'

const PERSISTED_FIELDS = [
  'title',
  'tiers',
  'unrankedItemIds',
  'items',
  'deletedItems',
] as const

let saveTimeout: ReturnType<typeof setTimeout> | null = null
let autosaveUnsubscribe: (() => void) | null = null

const getActivePaletteId = (): PaletteId =>
  THEME_PALETTE[useSettingsStore.getState().themeId]

const createBoardMeta = (id: string, title: string): BoardMeta => ({
  id,
  title,
  createdAt: Date.now(),
})

const deduplicateTitle = (title: string, boards: BoardMeta[]): string =>
{
  const base = title.replace(/ \(\d+\)$/, '')
  const existing = new Set(boards.map((board) => board.title))

  if (!existing.has(base))
  {
    return base
  }

  let n = 2

  while (existing.has(`${base} (${n})`))
  {
    n++
  }

  return `${base} (${n})`
}

export const saveBoardSnapshot = (boardId: string): void =>
{
  const data = extractBoardData(useTierListStore.getState())
  saveBoardToStorage(boardId, data, (message) =>
    useTierListStore.getState().setRuntimeError(message)
  )
}

export const saveActiveBoardSnapshot = (): void =>
{
  const { activeBoardId } = useBoardManagerStore.getState()

  if (activeBoardId)
  {
    saveBoardSnapshot(activeBoardId)
  }
}

export const loadPersistedBoard = (boardId: string): TierListData =>
{
  const stored = loadBoardFromStorage(boardId)
  return normalizeTierListData(stored, getActivePaletteId())
}

export const loadBoardIntoSession = (boardId: string): TierListData =>
{
  const data = loadPersistedBoard(boardId)
  useTierListStore.getState().loadBoard(data)
  return data
}

const createBlankBoardData = (): TierListData => ({
  title: DEFAULT_TITLE,
  tiers: [],
  unrankedItemIds: [],
  items: {},
  deletedItems: [],
})

const saveAndActivateBoard = (
  data: TierListData,
  titleHint: string
): string =>
{
  const boardStore = useBoardManagerStore.getState()
  const id = `board-${crypto.randomUUID()}`
  const title = deduplicateTitle(titleHint, boardStore.boards)
  const normalized = normalizeTierListData(
    { ...data, title },
    getActivePaletteId(),
    title
  )

  saveBoardToStorage(id, normalized)
  useBoardManagerStore.getState().addBoardMeta(createBoardMeta(id, title), true)
  useTierListStore.getState().loadBoard(normalized)
  return id
}

export const bootstrapBoardSession = (): void =>
{
  migrateStorageKeys()

  const boardStore = useBoardManagerStore.getState()
  const nextActiveId =
    boardStore.activeBoardId || boardStore.boards[0]?.id || ''

  if (boardStore.boards.length > 0 && nextActiveId)
  {
    if (boardStore.activeBoardId !== nextActiveId)
    {
      boardStore.setActiveBoardId(nextActiveId)
    }

    loadBoardIntoSession(nextActiveId)
    return
  }

  const legacy = migrateLegacyBoard(DEFAULT_TITLE)

  if (legacy)
  {
    const data = normalizeTierListData(
      legacy.data as Partial<TierListData>,
      getActivePaletteId(),
      DEFAULT_TITLE
    )
    saveBoardToStorage(legacy.id, data)
    boardStore.replaceRegistry(
      [createBoardMeta(legacy.id, data.title)],
      legacy.id
    )
    useTierListStore.getState().loadBoard(data)
    return
  }

  const id = `board-${crypto.randomUUID()}`
  const data = createBlankBoardData()
  saveBoardToStorage(id, data)
  boardStore.replaceRegistry([createBoardMeta(id, data.title)], id)
  useTierListStore.getState().loadBoard(data)
}

export const registerBoardAutosave = (): (() => void) =>
{
  if (autosaveUnsubscribe)
  {
    return autosaveUnsubscribe
  }

  const unsubscribe = useTierListStore.subscribe((state, prevState) =>
  {
    if (PERSISTED_FIELDS.every((key) => state[key] === prevState[key]))
    {
      return
    }

    if (saveTimeout)
    {
      clearTimeout(saveTimeout)
    }

    saveTimeout = setTimeout(() =>
    {
      saveActiveBoardSnapshot()
    }, 300)
  })

  autosaveUnsubscribe = () =>
  {
    if (saveTimeout)
    {
      clearTimeout(saveTimeout)
      saveTimeout = null
    }

    unsubscribe()
    autosaveUnsubscribe = null
  }

  return autosaveUnsubscribe
}

export const createBoardSession = (): void =>
{
  saveActiveBoardSnapshot()
  saveAndActivateBoard(createBlankBoardData(), DEFAULT_TITLE)
}

export const createBoardSessionFromPreset = (preset: TierPreset): void =>
{
  saveActiveBoardSnapshot()
  const data = createBoardDataFromPreset(preset)
  saveAndActivateBoard(data, DEFAULT_TITLE)
}

export const switchBoardSession = (boardId: string): void =>
{
  const boardStore = useBoardManagerStore.getState()

  if (boardId === boardStore.activeBoardId)
  {
    return
  }

  if (!boardStore.boards.some((board) => board.id === boardId))
  {
    return
  }

  useTierListStore.getState().discardDragPreview()
  saveActiveBoardSnapshot()
  loadBoardIntoSession(boardId)
  boardStore.setActiveBoardId(boardId)
}

export const deleteBoardSession = (boardId: string): void =>
{
  const boardStore = useBoardManagerStore.getState()

  if (boardStore.boards.length <= 1)
  {
    useTierListStore
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
    loadBoardIntoSession(nextActiveId)
    return
  }

  boardStore.removeBoardMeta(boardId)
}

export const duplicateBoardSession = (boardId: string): void =>
{
  const boardStore = useBoardManagerStore.getState()

  if (!boardStore.boards.some((board) => board.id === boardId))
  {
    return
  }

  saveActiveBoardSnapshot()

  const source =
    boardId === boardStore.activeBoardId
      ? extractBoardData(useTierListStore.getState())
      : loadPersistedBoard(boardId)

  saveAndActivateBoard(source, source.title || DEFAULT_TITLE)
}

export const renameBoardSession = (boardId: string, title: string): void =>
{
  const trimmed = title.trim()

  if (!trimmed)
  {
    return
  }

  const boardStore = useBoardManagerStore.getState()
  boardStore.renameBoardMeta(boardId, trimmed)

  if (boardId === boardStore.activeBoardId)
  {
    useTierListStore.setState({ title: trimmed })
  }
}

export const importBoardSession = (data: TierListData): void =>
{
  saveActiveBoardSnapshot()
  saveAndActivateBoard(data, data.title || DEFAULT_TITLE)
}

export const importBoardsSession = (boards: TierListData[]): void =>
{
  if (boards.length === 0)
  {
    return
  }

  saveActiveBoardSnapshot()

  const boardStore = useBoardManagerStore.getState()
  let nextBoards = boardStore.boards
  let lastId = boardStore.activeBoardId

  for (const board of boards)
  {
    const id = `board-${crypto.randomUUID()}`
    const title = deduplicateTitle(board.title || DEFAULT_TITLE, nextBoards)
    const normalized = normalizeTierListData(
      { ...board, title },
      getActivePaletteId(),
      title
    )

    saveBoardToStorage(id, normalized)
    nextBoards = [...nextBoards, createBoardMeta(id, title)]
    lastId = id
  }

  if (!lastId)
  {
    return
  }

  useBoardManagerStore.getState().replaceRegistry(nextBoards, lastId)
  loadBoardIntoSession(lastId)
}
