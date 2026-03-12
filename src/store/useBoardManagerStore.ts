// src/store/useBoardManagerStore.ts
// * multi-board registry — manages board list, active board, & per-board localStorage
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import type { BoardMeta, TierListData, Tier } from '../types'
import { APP_STORAGE_KEY, BOARD_REGISTRY_KEY, DEFAULT_TITLE, boardStorageKey, buildDefaultTiers } from '../utils/constants'
import { buildSampleItemsState } from '../utils/sampleItems'
import { createInitialData, extractBoardData, useTierListStore } from './useTierListStore'

interface BoardManagerStore {
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
  // rename a board in the registry (updates toolbar title if active)
  renameBoard: (boardId: string, title: string) => void
  // sync the active board's title in the registry
  syncTitle: (title: string) => void
}

// extract TierListData from the tier list store & save to localStorage
const saveCurrentBoard = (boardId: string) => {
  const data = extractBoardData(useTierListStore.getState())
  saveBoardToStorage(boardId, data)
}

// save board data to its per-board localStorage key
const saveBoardToStorage = (boardId: string, data: TierListData) => {
  try {
    localStorage.setItem(boardStorageKey(boardId), JSON.stringify(data))
  } catch {
    useTierListStore.getState().setRuntimeError(
      'Could not save changes to localStorage. Free up browser storage and try again.',
    )
  }
}

// load board data from its per-board localStorage key
const loadBoardFromStorage = (boardId: string): TierListData | null => {
  try {
    const raw = localStorage.getItem(boardStorageKey(boardId))
    return raw ? (JSON.parse(raw) as TierListData) : null
  } catch {
    return null
  }
}

// build a blank board w/ default tiers & no items
const createBlankBoardData = (): TierListData => ({
  title: DEFAULT_TITLE,
  tiers: buildDefaultTiers(),
  unrankedItemIds: [],
  items: {},
  deletedItems: [],
})

// v1 tier IDs/colors used before the S–F → S–E rename in schema v2
const LEGACY_DEFAULT_TIER_SIGNATURE: Record<string, { name: string; color: string }> = {
  'tier-s': { name: 'S', color: '#ff7f7f' },
  'tier-a': { name: 'A', color: '#ffbf7f' },
  'tier-b': { name: 'B', color: '#ffdf7f' },
  'tier-c': { name: 'C', color: '#ffff7f' },
  'tier-d': { name: 'D', color: '#7fff7f' },
  'tier-f': { name: 'F', color: '#7fbfff' },
}

// check if the persisted tiers exactly match the v1 default signature
const isLegacyDefaultTierSet = (tiers: Tier[]): boolean => {
  const legacyIds = Object.keys(LEGACY_DEFAULT_TIER_SIGNATURE)
  if (tiers.length !== legacyIds.length) return false
  if (tiers.some((tier) => tier.id === 'tier-e')) return false

  for (const tierId of legacyIds) {
    const expected = LEGACY_DEFAULT_TIER_SIGNATURE[tierId]
    const actual = tiers.find((tier) => tier.id === tierId)
    if (!actual) return false
    if (actual.name !== expected.name) return false
    if (actual.color.toLowerCase() !== expected.color) return false
  }
  return true
}

// rename tier-f → tier-e & update its label/color to the v2 defaults
const migrateLegacyDefaultTierSet = (tiers: Tier[]): Tier[] => {
  if (!isLegacyDefaultTierSet(tiers)) return tiers
  return tiers.map((tier) =>
    tier.id === 'tier-f'
      ? { ...tier, id: 'tier-e', name: 'E', color: '#74e56d' }
      : tier,
  )
}

// attempt to migrate the legacy single-board localStorage key into the multi-board system
const migrateLegacyBoard = (): { id: string; data: TierListData } | null => {
  try {
    const raw = localStorage.getItem(APP_STORAGE_KEY)
    if (!raw) return null

    const envelope = JSON.parse(raw) as { state?: Partial<TierListData>; version?: number }
    const state = envelope?.state
    if (!state || !Array.isArray(state.tiers)) return null

    // run v1 → v2 tier migration if needed
    const version = envelope.version ?? 1
    const tiers = version < 2 ? migrateLegacyDefaultTierSet(state.tiers as Tier[]) : state.tiers as Tier[]

    const data: TierListData = {
      title: state.title ?? DEFAULT_TITLE,
      tiers,
      unrankedItemIds: state.unrankedItemIds ?? [],
      items: state.items ?? {},
      deletedItems: state.deletedItems ?? [],
    }

    // backfill sample items if board is completely empty
    const isEmpty = Object.keys(data.items).length === 0
      && data.unrankedItemIds.length === 0
      && data.tiers.every((t) => t.itemIds.length === 0)

    const finalData = isEmpty
      ? { ...data, ...buildSampleItemsState() }
      : data

    const id = `board-${crypto.randomUUID()}`
    saveBoardToStorage(id, finalData)

    // clean up legacy key
    localStorage.removeItem(APP_STORAGE_KEY)

    return { id, data: finalData }
  } catch {
    return null
  }
}

// append a numeric suffix if a title already exists in the board list
const deduplicateTitle = (title: string, boards: BoardMeta[]): string => {
  // strip an existing numeric suffix to find the base name
  const base = title.replace(/ \(\d+\)$/, '')
  const existing = new Set(boards.map((b) => b.title))
  if (!existing.has(base)) return base
  let n = 2
  while (existing.has(`${base} (${n})`)) n++
  return `${base} (${n})`
}

export const useBoardManagerStore = create<BoardManagerStore>()(
  persist(
    (set, get) => ({
      boards: [],
      activeBoardId: '',

      createBoard: () => {
        const { activeBoardId, boards } = get()

        // save the current board before switching
        if (activeBoardId) {
          saveCurrentBoard(activeBoardId)
        }

        const id = `board-${crypto.randomUUID()}`
        const title = deduplicateTitle(DEFAULT_TITLE, boards)
        const data = { ...createBlankBoardData(), title }
        saveBoardToStorage(id, data)

        // load blank board into the tier list store
        useTierListStore.getState().loadBoard(data)

        set({
          boards: [...boards, { id, title, createdAt: Date.now() }],
          activeBoardId: id,
        })
      },

      switchBoard: (boardId) => {
        const { activeBoardId, boards } = get()
        if (boardId === activeBoardId) return
        if (!boards.some((b) => b.id === boardId)) return

        // discard any active drag before switching
        useTierListStore.getState().discardDragPreview()

        // save the current board
        if (activeBoardId) {
          saveCurrentBoard(activeBoardId)
        }

        // load the target board
        const data = loadBoardFromStorage(boardId)
        useTierListStore.getState().loadBoard(data ?? createInitialData())

        set({ activeBoardId: boardId })
      },

      deleteBoard: (boardId) => {
        const { boards, activeBoardId } = get()

        if (boards.length <= 1) {
          useTierListStore.getState().setRuntimeError('At least one list must remain.')
          return
        }

        // remove per-board localStorage data
        try {
          localStorage.removeItem(boardStorageKey(boardId))
        } catch {
          // no-op
        }

        const nextBoards = boards.filter((b) => b.id !== boardId)

        // if deleting the active board, switch to the first remaining one
        if (boardId === activeBoardId) {
          const nextActive = nextBoards[0]
          const data = loadBoardFromStorage(nextActive.id)
          useTierListStore.getState().loadBoard(data ?? createInitialData())
          set({ boards: nextBoards, activeBoardId: nextActive.id })
        } else {
          set({ boards: nextBoards })
        }
      },

      duplicateBoard: (boardId) => {
        const { activeBoardId, boards } = get()
        if (!boards.some((b) => b.id === boardId)) return

        // save current board so we get the latest data
        if (activeBoardId) {
          saveCurrentBoard(activeBoardId)
        }

        // load the source board's data
        const sourceData = boardId === activeBoardId
          ? extractBoardData(useTierListStore.getState())
          : loadBoardFromStorage(boardId)

        if (!sourceData) return

        const id = `board-${crypto.randomUUID()}`
        const title = deduplicateTitle(sourceData.title, boards)
        const data = { ...sourceData, title }
        saveBoardToStorage(id, data)

        // switch to the duplicate
        useTierListStore.getState().loadBoard(data)

        set({
          boards: [...boards, { id, title, createdAt: Date.now() }],
          activeBoardId: id,
        })
      },

      renameBoard: (boardId, title) => {
        const trimmed = title.trim()
        if (!trimmed) return

        const { boards, activeBoardId } = get()
        const updated = boards.map((b) =>
          b.id === boardId ? { ...b, title: trimmed } : b,
        )
        set({ boards: updated })

        // if renaming the active board, push the new title into the tier list store
        if (boardId === activeBoardId) {
          useTierListStore.getState().updateTitle(trimmed)
        }
      },

      syncTitle: (title) => {
        const { activeBoardId, boards } = get()
        const active = boards.find((b) => b.id === activeBoardId)
        if (active?.title === title) return
        const updated = boards.map((b) =>
          b.id === activeBoardId ? { ...b, title } : b,
        )
        set({ boards: updated })
      },
    }),
    {
      name: BOARD_REGISTRY_KEY,
      storage: createJSONStorage(() => localStorage),
      // only persist registry data, not actions
      partialize: (state) => ({
        boards: state.boards,
        activeBoardId: state.activeBoardId,
      }),
      // handle first-load initialization & legacy migration
      onRehydrateStorage: () => (rehydratedState) => {
        if (!rehydratedState) return

        const { boards, activeBoardId } = rehydratedState

        // already initialized — load the active board into the tier list store
        if (boards.length > 0 && activeBoardId) {
          const data = loadBoardFromStorage(activeBoardId)
          if (data) {
            useTierListStore.getState().loadBoard(data)
          }
          return
        }

        // first load — check for legacy single-board data
        const legacy = migrateLegacyBoard()
        if (legacy) {
          useTierListStore.getState().loadBoard(legacy.data)
          rehydratedState.boards = [{ id: legacy.id, title: legacy.data.title, createdAt: Date.now() }]
          rehydratedState.activeBoardId = legacy.id
          // persist the new registry immediately
          useBoardManagerStore.persist.rehydrate()
          return
        }

        // fresh install — create board #1 w/ sample items
        const id = `board-${crypto.randomUUID()}`
        const data = createInitialData()
        saveBoardToStorage(id, data)
        useTierListStore.getState().loadBoard(data)
        rehydratedState.boards = [{ id, title: data.title, createdAt: Date.now() }]
        rehydratedState.activeBoardId = id
        // persist the new registry immediately
        useBoardManagerStore.persist.rehydrate()
      },
    },
  ),
)

// persisted field keys — used by auto-save to detect changes w/o manual enumeration
const PERSISTED_FIELDS = ['title', 'tiers', 'unrankedItemIds', 'items', 'deletedItems'] as const

// auto-save the active board whenever tier list data changes
let saveTimeout: ReturnType<typeof setTimeout> | null = null
useTierListStore.subscribe((state, prevState) => {
  // skip if board data hasn't changed (only runtime fields updated)
  if (PERSISTED_FIELDS.every((key) => state[key] === prevState[key])) {
    return
  }

  // debounce saves to avoid thrashing localStorage during rapid edits
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    const activeBoardId = useBoardManagerStore.getState().activeBoardId
    if (activeBoardId) {
      saveCurrentBoard(activeBoardId)
    }
  }, 300)
})
