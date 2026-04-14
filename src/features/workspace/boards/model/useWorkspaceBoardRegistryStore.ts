// src/features/workspace/boards/model/useWorkspaceBoardRegistryStore.ts
// * multi-board registry store — persisted board metadata only

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { BoardMeta } from '@/features/workspace/boards/model/contract'
import type { BoardId } from '@/shared/types/ids'
import { createAppPersistStorage } from '@/shared/lib/browserStorage'
import { BOARD_REGISTRY_KEY } from '../data/local/boardRegistryStorage'

interface WorkspaceBoardRegistryStore
{
  boards: BoardMeta[]
  activeBoardId: BoardId | ''
  replaceRegistry: (boards: BoardMeta[], activeBoardId: BoardId) => void
  addBoardMeta: (board: BoardMeta, active?: boolean) => void
  setActiveBoardId: (boardId: BoardId) => void
  renameBoardMeta: (boardId: BoardId, title: string) => void
  removeBoardMeta: (boardId: BoardId) => void
}

export const useWorkspaceBoardRegistryStore =
  create<WorkspaceBoardRegistryStore>()(
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
