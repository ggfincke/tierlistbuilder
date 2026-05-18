// src/features/library/model/useLocalBoardsLibrary.ts
// projects locally-persisted boards into LibraryBoardListItem rows for the
// signed-out My Boards grid — every row is syncState 'localOnly'

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
import type {
  PaletteId,
  TierColorSpec,
} from '@tierlistbuilder/contracts/lib/theme'
import { loadBoardFromStorage } from '~/features/workspace/boards/data/local/boardStorage'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { getImageRenditionRefs } from '~/shared/lib/imageRefs'
import { getCachedImageUrl } from '~/shared/images/imageBlobCache'
import { normalizeBoardSnapshot } from '~/shared/board-data/boardSnapshot'

const DEFAULT_LOCAL_PALETTE_ID: PaletteId = 'classic'

type LocalLibrarySnapshot = BoardSnapshot

interface LocalBoardsLibraryResult
{
  // null while disabled (signed-in) so the page can treat this like the cloud
  // subscription hook & share the same downstream rendering
  rows: LibraryBoardListItem[] | null
  isLoading: boolean
}

const toLocalLibrarySnapshot = (
  snapshot: Partial<BoardSnapshot> | null
): LocalLibrarySnapshot | null =>
{
  if (
    !snapshot ||
    !Array.isArray(snapshot.tiers) ||
    !Array.isArray(snapshot.unrankedItemIds) ||
    !snapshot.items ||
    typeof snapshot.items !== 'object'
  )
  {
    return null
  }

  return normalizeBoardSnapshot(
    snapshot,
    snapshot.paletteId ?? DEFAULT_LOCAL_PALETTE_ID
  )
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

const projectLocalRows = (
  boards: readonly BoardMeta[]
): LibraryBoardListItem[] => boards.map(projectLocalRow)

export const useLocalBoardsLibrary = (
  enabled: boolean
): LocalBoardsLibraryResult =>
{
  const boards = useWorkspaceBoardRegistryStore((state) => state.boards)

  const rows = useMemo(
    () => (enabled ? projectLocalRows(boards) : null),
    [enabled, boards]
  )

  return { rows, isLoading: false }
}
