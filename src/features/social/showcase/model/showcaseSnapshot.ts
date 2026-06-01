// src/features/social/showcase/model/showcaseSnapshot.ts
// adapt showcase contract data <-> BoardSnapshot so the shared board renderer &
// the workspace editor can drive the tier list of tier lists

import type {
  BoardSnapshot,
  ShowcaseItemRef,
  Tier,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import type { ItemId, TierId } from '@tierlistbuilder/contracts/lib/ids'
import type { PaletteId } from '@tierlistbuilder/contracts/lib/theme'
import {
  type ProfileShowcaseEditData,
  type ProfileShowcaseSaveInput,
  type PublicProfileShowcase,
  type ShowcasePlacementInput,
  type ShowcaseRankingTile,
  type ShowcaseTier,
} from '@tierlistbuilder/contracts/social/showcase'
import type { ShowcaseRenderState } from '~/shared/board-ui/ShowcaseRenderContext'

interface ShowcaseSnapshot
{
  snapshot: BoardSnapshot
  render: ShowcaseRenderState
}

// fixed palette for every showcase surface (editor & public profile) so tier
// colors stay WYSIWYG & independent of the owner's workspace palette
export const SHOWCASE_PALETTE_ID: PaletteId = 'classic'

const toBoardTier = (tier: ShowcaseTier, itemIds: ItemId[]): Tier =>
{
  const boardTier: Tier = {
    id: tier.externalId as TierId,
    name: tier.name,
    colorSpec: tier.colorSpec,
    itemIds,
  }
  if (tier.description) boardTier.description = tier.description
  if (tier.rowColorSpec) boardTier.rowColorSpec = tier.rowColorSpec
  return boardTier
}

const toBoardItem = (lane: ShowcaseItemRef): { id: ItemId; item: TierItem } =>
{
  const id = lane.boardExternalId as ItemId
  return {
    id,
    item: {
      id,
      label: lane.title,
      showcaseRanking: {
        boardExternalId: lane.boardExternalId,
        rankingSlug: lane.rankingSlug,
        title: lane.title,
      },
    },
  }
}

const addLaneItem = (
  items: Record<ItemId, TierItem>,
  tiles: Map<string, ShowcaseRankingTile>,
  tile: ShowcaseRankingTile
): ItemId =>
{
  const { id, item } = toBoardItem(tile)
  items[id] = item
  tiles.set(id, tile)
  return id
}

// public read-only projection -> snapshot for StaticBoard
export const publicShowcaseToSnapshot = (
  showcase: PublicProfileShowcase
): ShowcaseSnapshot =>
{
  const items: Record<ItemId, TierItem> = {}
  const tiles = new Map<string, ShowcaseRankingTile>()
  // board-unique invariant: a board maps to one item id, so skip duplicates
  // that would emit a duplicate React/dnd key (hardens against contract drift)
  const seenBoards = new Set<string>()
  const tiers = showcase.tiers.map((tier) =>
  {
    const itemIds: ItemId[] = []
    for (const tile of tier.tiles)
    {
      if (seenBoards.has(tile.boardExternalId)) continue
      seenBoards.add(tile.boardExternalId)
      itemIds.push(addLaneItem(items, tiles, tile))
    }
    return toBoardTier(tier, itemIds)
  })
  return {
    snapshot: {
      title: '',
      paletteId: SHOWCASE_PALETTE_ID,
      tiers,
      unrankedItemIds: [],
      items,
      deletedItems: [],
    },
    render: { tiles },
  }
}

// owner edit-state -> snapshot (placed in tiers, the rest in the unranked pool)
export const editShowcaseToSnapshot = (
  data: ProfileShowcaseEditData
): ShowcaseSnapshot =>
{
  const items: Record<ItemId, TierItem> = {}
  const tiles = new Map<string, ShowcaseRankingTile>()
  const validTierIds = new Set(data.tiers.map((tier) => tier.externalId))
  const placedByTier = new Map<string, ItemId[]>()
  const unrankedItemIds: ItemId[] = []
  // board-unique invariant: skip any duplicate board so it can't emit a
  // duplicate item id (the backend dedupes, this hardens against drift)
  const seenBoards = new Set<string>()
  // placements w/ a tierExternalId that no longer exists fall back to the pool
  // so the lane stays visible & active-count stays accurate
  for (const placed of data.placed)
  {
    if (seenBoards.has(placed.boardExternalId)) continue
    seenBoards.add(placed.boardExternalId)
    const id = addLaneItem(items, tiles, placed)
    if (!validTierIds.has(placed.tierExternalId))
    {
      unrankedItemIds.push(id)
      continue
    }
    const bucket = placedByTier.get(placed.tierExternalId)
    if (bucket) bucket.push(id)
    else placedByTier.set(placed.tierExternalId, [id])
  }
  const tiers = data.tiers.map((tier) =>
    toBoardTier(tier, placedByTier.get(tier.externalId) ?? [])
  )

  for (const tile of data.unranked)
  {
    if (seenBoards.has(tile.boardExternalId)) continue
    seenBoards.add(tile.boardExternalId)
    unrankedItemIds.push(addLaneItem(items, tiles, tile))
  }

  return {
    snapshot: {
      title: '',
      paletteId: SHOWCASE_PALETTE_ID,
      tiers,
      unrankedItemIds,
      items,
      deletedItems: [],
    },
    render: { tiles },
  }
}

// edited board snapshot -> save input. items left in the unranked pool are
// dropped (re-derived as available lanes on the next load)
export const boardSnapshotToShowcaseSave = (
  snapshot: BoardSnapshot
): ProfileShowcaseSaveInput =>
{
  const tiers: ShowcaseTier[] = snapshot.tiers.map((tier, order) => ({
    externalId: tier.id,
    name: tier.name,
    description: tier.description ?? null,
    colorSpec: tier.colorSpec,
    rowColorSpec: tier.rowColorSpec ?? null,
    order,
  }))

  const placements: ShowcasePlacementInput[] = []
  let order = 0
  for (const tier of snapshot.tiers)
  {
    for (const itemId of tier.itemIds)
    {
      const ranking = snapshot.items[itemId]?.showcaseRanking
      if (!ranking) continue
      placements.push({
        tierExternalId: tier.id,
        boardExternalId: ranking.boardExternalId,
        order,
      })
      order += 1
    }
  }

  return { tiers, placements }
}
