// src/features/workspace/boards/model/session/boardSessionRegistry.ts
// registry helpers shared by board session bootstrap & CRUD paths

import type { BoardMeta } from '@tierlistbuilder/contracts/workspace/board'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { PaletteId } from '@tierlistbuilder/contracts/lib/theme'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'

export const getActivePaletteId = (): PaletteId =>
  useSettingsStore.getState().paletteId

export const createBoardMeta = (id: BoardId, title: string): BoardMeta => ({
  id,
  title,
  createdAt: Date.now(),
})

export const hasBoardMeta = (boardId: BoardId): boolean =>
  useWorkspaceBoardRegistryStore
    .getState()
    .boards.some((board) => board.id === boardId)

export const deduplicateBoardTitle = (
  title: string,
  boards: BoardMeta[]
): string =>
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
