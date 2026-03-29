// src/store/useBoardManagerStore.ts
// * multi-board registry — manages board list, active board, & per-board localStorage

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { BoardMeta, TierListData } from '../types'
import { DEFAULT_TITLE } from '../utils/constants'
import {
  BOARD_REGISTRY_KEY,
  createAppPersistStorage,
  loadBoardFromStorage,
  migrateLegacyBoard,
  removeBoardFromStorage,
  saveBoardToStorage,
} from '../utils/storage'

import {
  createInitialData,
  extractBoardData,
  useTierListStore,
} from './useTierListStore'

interface BoardManagerStore
{
  // ordered list of all board metadata entries
  boards: BoardMeta[]
  // ID of the board currently loaded into useTierListStore
  activeBoardId: string
  // create a new blank board & switch to it
  createBoard: () => void
  // switch the active board (saves current, loads target)
  switchBoard: (boardId: string) => void
  // delete a board by ID
  deleteBoard: (boardId: string) => void
  // duplicate a board & switch to the copy
  duplicateBoard: (boardId: string) => void
  // rename a board in the registry (updates tier store title if active)
  renameBoard: (boardId: string, title: string) => void
  // create a new board from imported data & switch to it
  importBoard: (data: TierListData) => void
  // import multiple boards from a multi-board JSON export
  importBoards: (boards: TierListData[]) => void
}

// extract TierListData from the tier list store & save to localStorage
const saveCurrentBoard = (boardId: string) =>
{
  const data = extractBoardData(useTierListStore.getState())
  saveBoardToStorage(boardId, data, (msg) =>
    useTierListStore.getState().setRuntimeError(msg)
  )
}

// build a blank board w/ default tiers & no items
const createBlankBoardData = (): TierListData => createInitialData()

// load a board from storage into the active tier store, falling back to fresh data
const loadBoardIntoTierStore = (boardId: string): TierListData =>
{
  const data = loadBoardFromStorage(boardId) ?? createInitialData()
  useTierListStore.getState().loadBoard(data)
  return data
}

const createBoardMeta = (id: string, title: string) => ({
  id,
  title,
  createdAt: Date.now(),
})

// append a numeric suffix if a title already exists in the board list
const deduplicateTitle = (title: string, boards: BoardMeta[]): string =>
{
  // strip an existing numeric suffix to find the base name
  const base = title.replace(/ \(\d+\)$/, '')
  const existing = new Set(boards.map((b) => b.title))
  if (!existing.has(base)) return base
  let n = 2
  while (existing.has(`${base} (${n})`)) n++
  return `${base} (${n})`
}

// persist new board data, load it into the tier store, & register in the board list
const saveAndActivateBoard = (
  data: TierListData,
  titleHint: string,
  boards: BoardMeta[],
  set: (state: Partial<BoardManagerStore>) => void
): string =>
{
  const id = `board-${crypto.randomUUID()}`
  const title = deduplicateTitle(titleHint, boards)
  const boardData = { ...data, title }
  saveBoardToStorage(id, boardData)
  useTierListStore.getState().loadBoard(boardData)
  set({
    boards: [...boards, createBoardMeta(id, title)],
    activeBoardId: id,
  })
  return id
}

export const useBoardManagerStore = create<BoardManagerStore>()(
  persist(
    (set, get) => ({
      boards: [],
      activeBoardId: '',

      createBoard: () =>
      {
        const { activeBoardId, boards } = get()

        if (activeBoardId)
        {
          saveCurrentBoard(activeBoardId)
        }

        saveAndActivateBoard(createBlankBoardData(), DEFAULT_TITLE, boards, set)
      },

      switchBoard: (boardId) =>
      {
        const { activeBoardId, boards } = get()
        if (boardId === activeBoardId) return
        if (!boards.some((b) => b.id === boardId)) return

        // discard any active drag before switching
        useTierListStore.getState().discardDragPreview()

        // save the current board
        if (activeBoardId)
        {
          saveCurrentBoard(activeBoardId)
        }

        // load the target board
        loadBoardIntoTierStore(boardId)

        set({ activeBoardId: boardId })
      },

      deleteBoard: (boardId) =>
      {
        const { boards, activeBoardId } = get()

        if (boards.length <= 1)
        {
          useTierListStore
            .getState()
            .setRuntimeError('At least one list must remain.')
          return
        }

        removeBoardFromStorage(boardId)

        const nextBoards = boards.filter((b) => b.id !== boardId)

        // if deleting the active board, switch to the first remaining one
        if (boardId === activeBoardId)
        {
          const nextActive = nextBoards[0]
          loadBoardIntoTierStore(nextActive.id)
          set({ boards: nextBoards, activeBoardId: nextActive.id })
        }
        else
        {
          set({ boards: nextBoards })
        }
      },

      duplicateBoard: (boardId) =>
      {
        const { activeBoardId, boards } = get()
        if (!boards.some((b) => b.id === boardId)) return

        if (activeBoardId)
        {
          saveCurrentBoard(activeBoardId)
        }

        const sourceData =
          boardId === activeBoardId
            ? extractBoardData(useTierListStore.getState())
            : loadBoardFromStorage(boardId)

        if (!sourceData) return

        saveAndActivateBoard(sourceData, sourceData.title, boards, set)
      },

      renameBoard: (boardId, title) =>
      {
        const trimmed = title.trim()
        if (!trimmed) return

        const { boards, activeBoardId } = get()
        const updated = boards.map((b) =>
          b.id === boardId ? { ...b, title: trimmed } : b
        )
        set({ boards: updated })

        // if renaming the active board, update the tier list store directly
        if (boardId === activeBoardId)
        {
          useTierListStore.setState({ title: trimmed })
        }
      },

      importBoard: (data) =>
      {
        const { activeBoardId, boards } = get()

        if (activeBoardId)
        {
          saveCurrentBoard(activeBoardId)
        }

        saveAndActivateBoard(data, data.title || DEFAULT_TITLE, boards, set)
      },

      importBoards: (boards) =>
      {
        if (boards.length === 0) return

        const { activeBoardId, boards: currentBoards } = get()
        if (activeBoardId) saveCurrentBoard(activeBoardId)

        // batch-create all boards, activating the last one
        let updatedBoards = currentBoards
        let lastId = activeBoardId

        for (const data of boards)
        {
          const id = `board-${crypto.randomUUID()}`
          const title = deduplicateTitle(
            data.title || DEFAULT_TITLE,
            updatedBoards
          )
          const boardData = { ...data, title }
          saveBoardToStorage(id, boardData)
          updatedBoards = [...updatedBoards, createBoardMeta(id, title)]
          lastId = id
        }

        // load the last imported board into the active tier store
        const lastData = loadBoardFromStorage(lastId!)
        if (lastData) useTierListStore.getState().loadBoard(lastData)
        set({ boards: updatedBoards, activeBoardId: lastId })
      },
    }),
    {
      name: BOARD_REGISTRY_KEY,
      storage: createAppPersistStorage(),
      // only persist registry data, not actions
      partialize: (state) => ({
        boards: state.boards,
        activeBoardId: state.activeBoardId,
      }),
      // handle first-load initialization & legacy migration
      onRehydrateStorage: () => (rehydratedState) =>
      {
        if (!rehydratedState) return

        const { boards, activeBoardId } = rehydratedState

        // already initialized — load the active board into the tier list store
        if (boards.length > 0 && activeBoardId)
        {
          loadBoardIntoTierStore(activeBoardId)
          return
        }

        // first load — check for legacy single-board data
        const legacy = migrateLegacyBoard(DEFAULT_TITLE)
        if (legacy)
        {
          useTierListStore.getState().loadBoard(legacy.data)
          useBoardManagerStore.setState({
            boards: [createBoardMeta(legacy.id, legacy.data.title)],
            activeBoardId: legacy.id,
          })
          return
        }

        // fresh install — create board #1
        const id = `board-${crypto.randomUUID()}`
        const data = createInitialData()
        saveBoardToStorage(id, data)
        useTierListStore.getState().loadBoard(data)
        useBoardManagerStore.setState({
          boards: [createBoardMeta(id, data.title)],
          activeBoardId: id,
        })
      },
    }
  )
)

// persisted field keys — used by auto-save to detect changes w/o manual enumeration
const PERSISTED_FIELDS = [
  'title',
  'tiers',
  'unrankedItemIds',
  'items',
  'deletedItems',
] as const

// auto-save the active board whenever tier list data changes
let saveTimeout: ReturnType<typeof setTimeout> | null = null
useTierListStore.subscribe((state, prevState) =>
{
  // skip if board data hasn't changed (only runtime fields updated)
  if (PERSISTED_FIELDS.every((key) => state[key] === prevState[key]))
  {
    return
  }

  // debounce saves to avoid thrashing localStorage during rapid edits
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() =>
  {
    const activeBoardId = useBoardManagerStore.getState().activeBoardId
    if (activeBoardId)
    {
      saveCurrentBoard(activeBoardId)
    }
  }, 300)
})
