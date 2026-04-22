// src/features/workspace/boards/model/slices/helpers.ts
// cross-slice helpers shared by the active board slice creators

import type { BoardSnapshot } from '@/features/workspace/boards/model/contract'
import {
  EMPTY_SELECTION_SET,
  type ActiveBoardRuntimeState,
  type KeyboardMode,
} from '@/features/workspace/boards/model/runtime'
import type { ItemId } from '@/shared/types/ids'

// max entries kept in the undo & redo stacks
export const MAX_UNDO_HISTORY = 50

// max entries kept in the recently-deleted buffer
export const MAX_DELETED_ITEMS = 50

// build a fresh O(1) lookup set from a selection list
export const toSelectionSet = (ids: readonly ItemId[]): ReadonlySet<ItemId> =>
  ids.length === 0 ? EMPTY_SELECTION_SET : new Set(ids)

// produce a paired selection update — array & matching lookup set
export const selectionUpdate = (
  ids: ItemId[]
): {
  selectedItemIds: ItemId[]
  selectedItemIdSet: ReadonlySet<ItemId>
} => ({
  selectedItemIds: ids,
  selectedItemIdSet: toSelectionSet(ids),
})

// shallow structural check — compares title, container lengths, item-key
// count, & scalar board fields (aspect ratio, fit defaults). deep item maps
// are compared by reference since every mutation rebuilds the items/tiers
export const isSameSnapshot = (a: BoardSnapshot, b: BoardSnapshot): boolean =>
{
  if (a.title !== b.title) return false
  if (a.tiers.length !== b.tiers.length) return false
  if (a.unrankedItemIds.length !== b.unrankedItemIds.length) return false
  if (a.deletedItems.length !== b.deletedItems.length) return false
  if (a.items !== b.items) return false
  if (a.itemAspectRatio !== b.itemAspectRatio) return false
  if (a.itemAspectRatioMode !== b.itemAspectRatioMode) return false
  if (a.aspectRatioPromptDismissed !== b.aspectRatioPromptDismissed)
    return false
  if (a.defaultItemImageFit !== b.defaultItemImageFit) return false

  for (let i = 0; i < a.tiers.length; i++)
  {
    const tierA = a.tiers[i]
    const tierB = b.tiers[i]
    if (tierA.id !== tierB.id) return false
    if (tierA !== tierB) return false
  }

  return true
}

// flatten every live board item ID (all tiers + unranked) into one ordered list
export const getAllBoardItemIds = (
  state: Pick<ActiveBoardRuntimeState, 'tiers' | 'unrankedItemIds'>
): ItemId[] =>
{
  return [
    ...state.tiers.flatMap((tier) => tier.itemIds),
    ...state.unrankedItemIds,
  ]
}

// clean up transient refs (active, focus, selection, last-click) that point
// at an item being deleted or removed from the board
export const runtimeCleanupForItem = (
  state: ActiveBoardRuntimeState,
  itemId: ItemId
) =>
{
  const nextSelectedItemIds = state.selectedItemIds.filter(
    (id) => id !== itemId
  )

  return {
    activeItemId: state.activeItemId === itemId ? null : state.activeItemId,
    keyboardFocusItemId:
      state.keyboardFocusItemId === itemId ? null : state.keyboardFocusItemId,
    keyboardMode:
      state.keyboardFocusItemId === itemId || state.activeItemId === itemId
        ? ('idle' as KeyboardMode)
        : state.keyboardMode,
    ...selectionUpdate(nextSelectedItemIds),
    lastClickedItemId:
      state.lastClickedItemId === itemId ? null : state.lastClickedItemId,
  }
}
