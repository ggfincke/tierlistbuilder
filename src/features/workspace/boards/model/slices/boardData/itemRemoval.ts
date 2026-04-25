// src/features/workspace/boards/model/slices/boardData/itemRemoval.ts
// shared live-item removal patch used by direct item actions & selection bulk delete

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import { isPresent } from '~/shared/lib/typeGuards'
import {
  MAX_DELETED_ITEMS,
  runtimeCleanupForItems,
  stripItemsFromContainers,
} from '../helpers'
import { withUndo } from '../undoSlice'
import type { ActiveBoardStore } from '../types'

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
      },
      label
    ),
    ...runtimeCleanupForItems(state, idSet),
  }
}
