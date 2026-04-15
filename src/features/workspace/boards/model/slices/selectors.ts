// src/features/workspace/boards/model/slices/selectors.ts
// cross-slice selectors derived from the combined active-board store

import type { Tier } from '@tierlistbuilder/contracts/workspace/board'
import type { ActiveBoardRuntimeState } from '@/features/workspace/boards/model/runtime'
import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'

// cached fallback item ID keyed by the exact tiers & unranked array refs;
// avoids re-walking containers for every subscriber when the identity is
// unchanged. selectKeyboardTabStopItemId is called once per TierItem per
// state update, so on a 100-item board the naive walk is O(items²)
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
