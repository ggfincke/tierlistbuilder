// src/features/workspace/boards/model/useWorkspaceBoardRegistryStore.ts
// * multi-board registry store — persisted board metadata only

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { BoardMeta } from '@tierlistbuilder/contracts/workspace/board'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { createAppPersistStorage } from '~/shared/lib/browserStorage'

const BOARD_REGISTRY_KEY = 'tier-list-builder-boards'

interface WorkspaceBoardRegistryStore
{
  boards: BoardMeta[]
  activeBoardId: BoardId | null
  replaceRegistry: (boards: BoardMeta[], activeBoardId: BoardId | null) => void
  addBoardMeta: (board: BoardMeta, active?: boolean) => void
  setActiveBoardId: (boardId: BoardId | null) => void
  renameBoardMeta: (boardId: BoardId, title: string) => void
  removeBoardMeta: (boardId: BoardId) => void
}

// bump after the pre-1.0 cleanup so older persisted registries reset cleanly
const BOARD_REGISTRY_STORAGE_VERSION = 3

export const useWorkspaceBoardRegistryStore =
  create<WorkspaceBoardRegistryStore>()(
    persist(
      (set) => ({
        boards: [],
        activeBoardId: null,

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
        version: BOARD_REGISTRY_STORAGE_VERSION,
        partialize: (state) => ({
          boards: state.boards,
          activeBoardId: state.activeBoardId,
        }),
      }
    )
  )
