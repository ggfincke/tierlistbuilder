// src/features/workspace/boards/model/slices/boardData/itemRemoval.ts
// shared live-item removal patch used by direct item actions & selection bulk delete

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import { isPresent } from '~/shared/lib/typeGuards'
import {
  MAX_DELETED_ITEMS,
  runtimeCleanupForItems,
  stripItemsFromContainers,
} from '~/features/workspace/boards/model/slices/helpers'
import { withUndo } from '~/features/workspace/boards/model/slices/undoSlice'
import type { ActiveBoardStore } from '~/features/workspace/boards/model/slices/types'

export const buildRemoveItemsPatch = (
  state: ActiveBoardStore,
  itemIds: readonly ItemId[],
  label: string
): Partial<ActiveBoardStore> | null =>
{
  const uniqueIds = [...new Set(itemIds)].filter((id) => state.items[id])

  if (uniqueIds.length === 0)
  {
    return null
  }

  const idSet = new Set(uniqueIds)
  const { tiers, unrankedItemIds } = stripItemsFromContainers(state, idSet)
  const items = { ...state.items }
  const removedItems = uniqueIds.map((id) => items[id]).filter(isPresent)

  for (const id of uniqueIds)
  {
    delete items[id]
  }

  const deletedItems = [...removedItems, ...state.deletedItems].slice(
    0,
    MAX_DELETED_ITEMS
  )

  return {
    ...withUndo(
      state,
      {
        tiers,
        unrankedItemIds,
        items,
        deletedItems,
        activeItemCount: state.activeItemCount - uniqueIds.length,
      },
      label
    ),
    ...runtimeCleanupForItems(state, idSet),
  }
}
