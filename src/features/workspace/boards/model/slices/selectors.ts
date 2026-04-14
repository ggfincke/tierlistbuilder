// src/features/workspace/boards/model/slices/selectors.ts
// cross-slice selectors derived from the combined active-board store

import type { ActiveBoardRuntimeState } from '@/features/workspace/boards/model/runtime'
import type { ItemId } from '@/shared/types/ids'

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

  for (const tier of state.tiers)
  {
    if (tier.itemIds.length > 0)
    {
      return tier.itemIds[0]
    }
  }

  return state.unrankedItemIds[0] ?? null
}
