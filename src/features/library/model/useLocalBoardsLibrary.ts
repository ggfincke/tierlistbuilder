// src/features/library/model/useLocalBoardsLibrary.ts
// projects locally-persisted boards into LibraryBoardListItem rows for the
// My Boards grid

import { useMemo } from 'react'

import {
  LIBRARY_BOARD_COVER_ITEM_LIMIT,
  LIBRARY_BOARD_TIER_LIMIT,
  deriveLibraryPublishState,
  type BoardSnapshot,
  type BoardMeta,
  type LibraryBoardCoverItem,
  type LibraryBoardListItem,
  type LibraryBoardTierBreakdown,
  type TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import {
  PALETTE_IDS,
  type PaletteId,
  type TierColorSpec,
} from '@tierlistbuilder/contracts/lib/theme'
import { loadBoardFromStorage } from '~/features/workspace/boards/data/local/boardStorage'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { normalizeBoardSnapshot } from '~/shared/board-data/boardSnapshot'
import { getImageRenditionRefs } from '~/shared/lib/imageRefs'
import { getCachedImageUrl } from '~/shared/images/imageBlobCache'

const DEFAULT_LOCAL_PALETTE_ID: PaletteId = 'classic'

type LocalLibrarySnapshot = BoardSnapshot

const selectSnapshotPaletteId = (
  snapshot: Partial<BoardSnapshot> | null
): PaletteId =>
{
  const paletteId = snapshot?.paletteId
  return typeof paletteId === 'string' &&
    (PALETTE_IDS as readonly string[]).includes(paletteId)
    ? (paletteId as PaletteId)
    : DEFAULT_LOCAL_PALETTE_ID
}

const toLocalLibrarySnapshot = (
  snapshot: Partial<BoardSnapshot> | null
): LocalLibrarySnapshot | null =>
{
  if (!snapshot)
  {
    return null
  }

  return normalizeBoardSnapshot(snapshot, selectSnapshotPaletteId(snapshot))
}

const orderedLiveItems = (
  snapshot: LocalLibrarySnapshot | null
): TierItem[] =>
{
  if (!snapshot) return []

  const seen = new Set<ItemId>()
  const items: TierItem[] = []
  const push = (id: ItemId) =>
  {
    if (seen.has(id)) return
    seen.add(id)
    const item = snapshot.items[id]
    if (item) items.push(item)
  }

  for (const tier of snapshot.tiers)
  {
    for (const itemId of tier.itemIds) push(itemId)
  }
  for (const itemId of snapshot.unrankedItemIds) push(itemId)

  return items
}

const toCoverItem = (item: TierItem): LibraryBoardCoverItem =>
{
  const media = getImageRenditionRefs(item, 'thumbnail')[0]
  return {
    label: item.label ?? null,
    externalId: item.id,
    mediaUrl: media ? getCachedImageUrl(media.ref.hash) : null,
    ...(media
      ? {
          mediaHash: media.ref.hash,
          mediaVariant: media.variant,
          ...(media.ref.cloudMediaExternalId
            ? { mediaCloudExternalId: media.ref.cloudMediaExternalId }
            : {}),
        }
      : {}),
  }
}

const buildCoverItems = (
  snapshot: LocalLibrarySnapshot | null
): LibraryBoardCoverItem[] =>
  orderedLiveItems(snapshot)
    .slice(0, LIBRARY_BOARD_COVER_ITEM_LIMIT)
    .map(toCoverItem)

// project one persisted board into a library row. corrupt/missing snapshots
// still surface as a row w/ zeroed counts so the board stays openable
export const projectLocalRow = (meta: BoardMeta): LibraryBoardListItem =>
{
  const loaded = loadBoardFromStorage(meta.id)
  const snapshot =
    loaded.status === 'ok' ? toLocalLibrarySnapshot(loaded.data) : null
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
    sourceTemplateCoverMedia: snapshot?.sourceTemplateCoverMedia ?? null,
    sourceTemplateCoverFraming: snapshot?.sourceTemplateCoverFraming ?? null,
    coverItems: buildCoverItems(snapshot),
    paletteId: snapshot?.paletteId ?? DEFAULT_LOCAL_PALETTE_ID,
    tierColors,
    tierBreakdown,
    pinned: false,
  }
}

export const projectLocalRows = (
  boards: readonly BoardMeta[]
): LibraryBoardListItem[] => boards.map(projectLocalRow)

export const useLocalBoardsLibrary = (): LibraryBoardListItem[] =>
{
  const boards = useWorkspaceBoardRegistryStore((state) => state.boards)
  return useMemo(() => projectLocalRows(boards), [boards])
}
