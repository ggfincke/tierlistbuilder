// src/shared/board-ui/labels/labelOverrides.ts
// shared helpers for tracking & clearing per-item label overrides

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import {
  isEmptyItemLabelOptions,
  type ItemLabelOptions,
  type TierItem,
} from '@tierlistbuilder/contracts/workspace/board'

export interface LabelOptionsClearEntry
{
  id: ItemId
  options: ItemLabelOptions | null
}

// build the clear-entry list for every item that carries a non-empty
// labelOptions override; consumed by setBoardAndItemsLabelOptions to wipe
// per-tile overrides in a single undo step
export const collectLabelOptionClearEntries = (
  items: readonly TierItem[]
): LabelOptionsClearEntry[] =>
  items
    .filter((item) => !isEmptyItemLabelOptions(item.labelOptions))
    .map((item) => ({ id: item.id, options: null }))
