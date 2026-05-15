// src/features/library/model/useLocalBoardsLibrary.ts
// projects locally-persisted boards into LibraryBoardListItem rows for the
// signed-out My Boards grid — every row is syncState 'localOnly'

import { useMemo } from 'react'

import {
  LIBRARY_BOARD_TIER_LIMIT,
  deriveLibraryPublishState,
  type BoardMeta,
  type LibraryBoardListItem,
  type LibraryBoardTierBreakdown,
} from '@tierlistbuilder/contracts/workspace/board'
import type {
  PaletteId,
  TierColorSpec,
} from '@tierlistbuilder/contracts/lib/theme'
import { loadBoardFromStorage } from '~/features/workspace/boards/data/local/boardStorage'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'

const DEFAULT_LOCAL_PALETTE_ID: PaletteId = 'classic'

interface LocalBoardsLibraryResult
{
  // null while disabled (signed-in) so the page can treat this like the cloud
  // subscription hook & share the same downstream rendering
  rows: LibraryBoardListItem[] | null
  isLoading: boolean
}

// project one persisted board into a library row. corrupt/missing snapshots
// still surface as a row w/ zeroed counts so the board stays openable
const projectLocalRow = (meta: BoardMeta): LibraryBoardListItem =>
{
  const loaded = loadBoardFromStorage(meta.id)
  const snapshot = loaded.status === 'ok' ? loaded.data : null
  const tiers = snapshot?.tiers ?? []
  const unrankedItemCount = snapshot?.unrankedItemIds?.length ?? 0
  const rankedItemCount = tiers.reduce(
    (sum, tier) => sum + tier.itemIds.length,
    0
  )

  const cappedTiers = tiers.slice(0, LIBRARY_BOARD_TIER_LIMIT)
  const tierBreakdown: LibraryBoardTierBreakdown[] = cappedTiers.map(
    (tier, index) => ({
      tierIndex: index,
      itemCount: tier.itemIds.length,
      colorSpec: tier.colorSpec,
    })
  )
  const tierColors: TierColorSpec[] = cappedTiers.map((tier) => tier.colorSpec)

  return {
    externalId: meta.id,
    title: meta.title,
    createdAt: meta.createdAt,
    // local registry metadata carries no mtime — creation order is the best
    // available signal for the "last updated" sort
    updatedAt: meta.createdAt,
    revision: 0,
    activeItemCount: unrankedItemCount + rankedItemCount,
    unrankedItemCount,
    rankedItemCount,
    publishState: deriveLibraryPublishState({
      rankedItemCount,
      hasPublishedTemplate: false,
    }),
    syncState: 'localOnly',
    visibility: 'private',
    category: 'other',
    sourceTemplateSizeClass: null,
    coverItems: [],
    paletteId: snapshot?.paletteId ?? DEFAULT_LOCAL_PALETTE_ID,
    tierColors,
    tierBreakdown,
    pinned: false,
  }
}

export const useLocalBoardsLibrary = (
  enabled: boolean
): LocalBoardsLibraryResult =>
{
  const boards = useWorkspaceBoardRegistryStore((state) => state.boards)

  const rows = useMemo(
    () => (enabled ? boards.map(projectLocalRow) : null),
    [enabled, boards]
  )

  return { rows, isLoading: false }
}
