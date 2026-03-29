// src/store/useBoardManagerStore.ts
// * multi-board registry store — persisted board metadata only

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { BoardMeta } from '../types'
import { BOARD_REGISTRY_KEY, createAppPersistStorage } from '../utils/storage'

interface BoardManagerStore
{
  boards: BoardMeta[]
  activeBoardId: string
  replaceRegistry: (boards: BoardMeta[], activeBoardId: string) => void
  addBoardMeta: (board: BoardMeta, active?: boolean) => void
  setActiveBoardId: (boardId: string) => void
  renameBoardMeta: (boardId: string, title: string) => void
  removeBoardMeta: (boardId: string) => void
}

export const useBoardManagerStore = create<BoardManagerStore>()(
  persist(
    (set) => ({
      boards: [],
      activeBoardId: '',

      replaceRegistry: (boards, activeBoardId) =>
        set({ boards, activeBoardId }),

      addBoardMeta: (board, active = false) =>
        set((state) => ({
          boards: [...state.boards, board],
          activeBoardId: active ? board.id : state.activeBoardId,
        })),

      setActiveBoardId: (boardId) => set({ activeBoardId: boardId }),

      renameBoardMeta: (boardId, title) =>
        set((state) => ({
          boards: state.boards.map((board) =>
            board.id === boardId ? { ...board, title } : board
          ),
        })),

      removeBoardMeta: (boardId) =>
        set((state) => ({
          boards: state.boards.filter((board) => board.id !== boardId),
        })),
    }),
    {
      name: BOARD_REGISTRY_KEY,
      storage: createAppPersistStorage(),
      partialize: (state) => ({
        boards: state.boards,
        activeBoardId: state.activeBoardId,
      }),
    }
  )
)
