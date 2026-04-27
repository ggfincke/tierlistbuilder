// src/features/workspace/boards/model/slices/helpers.ts
// cross-slice helpers shared by the active board slice creators

import type {
  BoardSnapshot,
  Tier,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  makeSelection,
  type ActiveBoardRuntimeState,
  type ContainerSnapshot,
} from '~/features/workspace/boards/model/runtime'
import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'

export const MAX_UNDO_HISTORY = 50

export const MAX_DELETED_ITEMS = 50

// ref-equality check — mutations rebuild the touched array/map/tier so
// per-field ref comparison catches any meaningful change w/o a deep walk.
// aspect-ratio scalars are compared last so the cheap array-ref bails fire first
export const isSameSnapshot = (a: BoardSnapshot, b: BoardSnapshot): boolean =>
{
  if (a === b) return true
  if (a.title !== b.title) return false
  if (a.items !== b.items) return false
  if (a.unrankedItemIds !== b.unrankedItemIds) return false
  if (a.deletedItems !== b.deletedItems) return false
  if (a.itemAspectRatio !== b.itemAspectRatio) return false
  if (a.itemAspectRatioMode !== b.itemAspectRatioMode) return false
  if (a.aspectRatioPromptDismissed !== b.aspectRatioPromptDismissed)
    return false
  if (a.defaultItemImageFit !== b.defaultItemImageFit) return false
  if (a.paletteId !== b.paletteId) return false
  if (a.textStyleId !== b.textStyleId) return false
  if (a.pageBackground !== b.pageBackground) return false
  if (a.tiers === b.tiers) return true
  if (a.tiers.length !== b.tiers.length) return false
  for (let i = 0; i < a.tiers.length; i++)
  {
    if (a.tiers[i] !== b.tiers[i]) return false
  }
  return true
}

export const getAllBoardItemIds = (
  state: Pick<ActiveBoardRuntimeState, 'tiers' | 'unrankedItemIds'>
): ItemId[] =>
{
  return [
    ...state.tiers.flatMap((tier) => tier.itemIds),
    ...state.unrankedItemIds,
  ]
}

// filter `ids` through `idSet` but return the input ref when nothing is
// removed — lets downstream shallow-equality checks bail gratuitously
const filterItemIdsPreservingRef = (
  ids: ItemId[],
  idSet: ReadonlySet<ItemId>
): ItemId[] =>
{
  if (idSet.size === 0) return ids
  let removed = false
  const next: ItemId[] = []
  for (const id of ids)
  {
    if (idSet.has(id))
    {
      removed = true
      continue
    }
    next.push(id)
  }
  return removed ? next : ids
}

const stripItemsFromTiers = <TTier extends { itemIds: ItemId[] }>(
  tiers: TTier[],
  idSet: ReadonlySet<ItemId>
): TTier[] =>
{
  let changed = false
  const next = tiers.map((tier) =>
  {
    const nextItemIds = filterItemIdsPreservingRef(tier.itemIds, idSet)
    if (nextItemIds === tier.itemIds) return tier
    changed = true
    return { ...tier, itemIds: nextItemIds }
  })
  return changed ? next : tiers
}

// remove items from every tier & the unranked pool — preserves tier refs
// when a tier has nothing stripped, so downstream TierRow memoization bails
export const stripItemsFromContainers = (
  state: Pick<ActiveBoardRuntimeState, 'tiers' | 'unrankedItemIds'>,
  idSet: ReadonlySet<ItemId>
): { tiers: Tier[]; unrankedItemIds: ItemId[] } =>
{
  const tiers = stripItemsFromTiers(state.tiers, idSet)
  const unrankedItemIds = filterItemIdsPreservingRef(
    state.unrankedItemIds,
    idSet
  )
  return {
    tiers,
    unrankedItemIds,
  }
}

// remove items from a drag preview snapshot — used when secondary selection
// items must be hidden from the snapshot while their tiles collapse visually
export const stripItemsFromSnapshot = (
  snapshot: ContainerSnapshot,
  idSet: ReadonlySet<ItemId>
): ContainerSnapshot =>
{
  const tiers = stripItemsFromTiers(snapshot.tiers, idSet)
  const unrankedItemIds = filterItemIdsPreservingRef(
    snapshot.unrankedItemIds,
    idSet
  )
  if (
    tiers === snapshot.tiers &&
    unrankedItemIds === snapshot.unrankedItemIds
  )
  {
    return snapshot
  }
  return {
    tiers,
    unrankedItemIds,
  }
}

// clean up transient refs (active, focus, selection, last-click) that point
// at an item being deleted or removed from the board
export const runtimeCleanupForItem = (
  state: ActiveBoardRuntimeState,
  itemId: ItemId
) => runtimeCleanupForItems(state, new Set([itemId]))

export const runtimeCleanupForItems = (
  state: ActiveBoardRuntimeState,
  itemIds: ReadonlySet<ItemId>
) =>
{
  const nextSelectionIds = state.selection.ids.filter((id) => !itemIds.has(id))
  const selection =
    nextSelectionIds.length === state.selection.ids.length
      ? state.selection
      : makeSelection(nextSelectionIds)
  const activeRemoved =
    state.activeItemId !== null && itemIds.has(state.activeItemId)
  const focusRemoved =
    state.keyboardFocusItemId !== null && itemIds.has(state.keyboardFocusItemId)

  return {
    activeItemId: activeRemoved ? null : state.activeItemId,
    keyboardFocusItemId: focusRemoved ? null : state.keyboardFocusItemId,
    keyboardMode: activeRemoved || focusRemoved ? 'idle' : state.keyboardMode,
    selection,
    lastClickedItemId:
      state.lastClickedItemId !== null && itemIds.has(state.lastClickedItemId)
        ? null
        : state.lastClickedItemId,
  }
}
