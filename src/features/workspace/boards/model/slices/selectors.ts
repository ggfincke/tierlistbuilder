// src/features/workspace/boards/model/slices/selectors.ts
// cross-slice selectors derived from the combined active-board store

import type { Tier } from '@tierlistbuilder/contracts/workspace/board'
import type { ActiveBoardRuntimeState } from '~/features/workspace/boards/model/runtime'
import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'

// true while a pointer drag preview is active or a keyboard-drag group exists
export const selectIsDragging = (
  state: Pick<ActiveBoardRuntimeState, 'dragPreview' | 'dragGroupIds'>
): boolean => state.dragPreview !== null || state.dragGroupIds.length > 0

// whether the undo stack has anything to revert
export const selectCanUndo = (
  state: Pick<ActiveBoardRuntimeState, 'past'>
): boolean => state.past.length > 0

// whether the redo stack has anything to replay
export const selectCanRedo = (
  state: Pick<ActiveBoardRuntimeState, 'future'>
): boolean => state.future.length > 0

// true when the user is in keyboard-browse mode w/ at least one selected item
export const selectHasKeyboardSelection = (
  state: Pick<ActiveBoardRuntimeState, 'keyboardMode' | 'selectedItemIdSet'>
): boolean =>
  state.keyboardMode === 'browse' && state.selectedItemIdSet.size > 0

// cached fallback item ID keyed by tiers & unranked array refs;
// avoids O(items²) re-walk when identity is unchanged across updates
let cachedTiersRef: readonly Tier[] | null = null
let cachedUnrankedRef: readonly ItemId[] | null = null
let cachedFallback: ItemId | null = null

const getFallbackTabStop = (
  tiers: readonly Tier[],
  unrankedItemIds: readonly ItemId[]
): ItemId | null =>
{
  if (cachedTiersRef === tiers && cachedUnrankedRef === unrankedItemIds)
  {
    return cachedFallback
  }

  let next: ItemId | null = null
  for (const tier of tiers)
  {
    if (tier.itemIds.length > 0)
    {
      next = tier.itemIds[0]
      break
    }
  }

  if (next === null)
  {
    next = unrankedItemIds[0] ?? null
  }

  cachedTiersRef = tiers
  cachedUnrankedRef = unrankedItemIds
  cachedFallback = next
  return next
}

// derive the single keyboard tab-stop item ID for the whole board so each
// TierItem can compare against it w/o re-walking tiers per render
export const selectKeyboardTabStopItemId = (
  state: Pick<
    ActiveBoardRuntimeState,
    'keyboardFocusItemId' | 'tiers' | 'unrankedItemIds'
  >
): ItemId | null =>
{
  if (state.keyboardFocusItemId)
  {
    return state.keyboardFocusItemId
  }

  return getFallbackTabStop(state.tiers, state.unrankedItemIds)
}
