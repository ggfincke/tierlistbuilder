// src/features/library/model/useBoardsLibrary.ts
// local-store projection for the My Lists library row set

import { useMemo } from 'react'

import type {
  BoardSnapshot,
  LibraryBoardCoverItem,
  LibraryBoardListItem,
  LibraryBoardTierBreakdown,
} from '@tierlistbuilder/contracts/workspace/board'
import { deriveLibraryBoardStatus } from '@tierlistbuilder/contracts/workspace/board'
import type { BoardId, ItemId } from '@tierlistbuilder/contracts/lib/ids'
import type { PaletteId } from '@tierlistbuilder/contracts/lib/theme'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import {
  boardStorageKey,
  loadBoardFromStorage,
} from '~/features/workspace/boards/data/local/boardStorage'
import { readBrowserStorageItem } from '~/shared/lib/browserStorage'
import { normalizeBoardSnapshot } from '~/shared/board-data/boardSnapshot'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'

interface BoardsLibraryResult
{
  rows: LibraryBoardListItem[]
}

// memoize the parse + normalize + project pass keyed on the raw envelope
// string so unchanged boards skip JSON.parse + per-item normalization
interface CachedRow
{
  envelope: string | null
  paletteId: PaletteId
  title: string
  createdAt: number
  row: LibraryBoardListItem
}

const rowCache = new Map<BoardId, CachedRow>()

const itemOrderForSnapshot = (snapshot: BoardSnapshot): ItemId[] => [
  ...snapshot.tiers.flatMap((tier) => tier.itemIds),
  ...snapshot.unrankedItemIds,
]

const buildCoverItems = (snapshot: BoardSnapshot): LibraryBoardCoverItem[] =>
  itemOrderForSnapshot(snapshot)
    .map((id) => snapshot.items[id])
    .filter((item) => item !== undefined)
    .slice(0, 18)
    .map((item) => ({
      externalId: item.id,
      label: item.label?.trim() || null,
      mediaUrl: null,
    }))

const buildTierBreakdown = (
  snapshot: BoardSnapshot
): LibraryBoardTierBreakdown[] =>
  snapshot.tiers.slice(0, 5).map((tier, tierIndex) => ({
    tierIndex,
    itemCount: tier.itemIds.length,
    colorSpec: tier.colorSpec,
  }))

const toLibraryRow = (
  boardId: BoardId,
  title: string,
  createdAt: number,
  snapshot: BoardSnapshot
): LibraryBoardListItem =>
{
  const activeItemCount = Object.keys(snapshot.items).length
  const unrankedItemCount = snapshot.unrankedItemIds.length
  const rankedItemCount = Math.max(0, activeItemCount - unrankedItemCount)
  const status = deriveLibraryBoardStatus({
    activeItemCount,
    unrankedItemCount,
    hasPublishedTemplate: false,
  })

  return {
    externalId: boardId,
    title: snapshot.title || title,
    createdAt,
    updatedAt: createdAt,
    revision: 0,
    activeItemCount,
    unrankedItemCount,
    rankedItemCount,
    status,
    visibility: 'private',
    category: 'other',
    sourceTemplateSizeClass: null,
    coverItems: buildCoverItems(snapshot),
    paletteId: snapshot.paletteId ?? 'classic',
    tierColors: snapshot.tiers.slice(0, 5).map((tier) => tier.colorSpec),
    tierBreakdown: buildTierBreakdown(snapshot),
    pinned: false,
  }
}

export const useBoardsLibrary = (): BoardsLibraryResult =>
{
  const boards = useWorkspaceBoardRegistryStore((state) => state.boards)
  const paletteId = usePreferencesStore((state) => state.paletteId)

  const rows = useMemo(
    () =>
      boards.flatMap((meta) =>
      {
        const envelope = readBrowserStorageItem(boardStorageKey(meta.id))
        const cached = rowCache.get(meta.id)
        if (
          cached &&
          cached.envelope === envelope &&
          cached.paletteId === paletteId &&
          cached.title === meta.title &&
          cached.createdAt === meta.createdAt
        )
        {
          return [cached.row]
        }

        const result = loadBoardFromStorage(meta.id)
        if (result.status !== 'ok')
        {
          rowCache.delete(meta.id)
          return []
        }
        const snapshot = normalizeBoardSnapshot(
          result.data,
          paletteId,
          meta.title
        )
        const row = toLibraryRow(meta.id, meta.title, meta.createdAt, snapshot)
        rowCache.set(meta.id, {
          envelope,
          paletteId,
          title: meta.title,
          createdAt: meta.createdAt,
          row,
        })
        return [row]
      }),
    [boards, paletteId]
  )

  return { rows }
}
