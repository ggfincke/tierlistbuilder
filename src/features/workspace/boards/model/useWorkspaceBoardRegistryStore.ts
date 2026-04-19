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

// v2: activeBoardId sentinel migrated from '' -> null. keeps the field
// nullable instead of carrying an empty-string BoardId through the type
// system
const BOARD_REGISTRY_STORAGE_VERSION = 2

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
        migrate: (persisted) =>
        {
          // v1 stored activeBoardId as BoardId | ''. cast through unknown so
          // we can detect & replace the empty-string sentinel; the legacy
          // shape no longer exists in the store's type surface
          const raw = persisted as Record<string, unknown>
          const legacyActiveId = raw.activeBoardId
          const nextActiveId =
            typeof legacyActiveId === 'string' && legacyActiveId.length > 0
              ? (legacyActiveId as BoardId)
              : null
          return {
            ...raw,
            activeBoardId: nextActiveId,
          } as WorkspaceBoardRegistryStore
        },
        partialize: (state) => ({
          boards: state.boards,
          activeBoardId: state.activeBoardId,
        }),
      }
    )
  )
