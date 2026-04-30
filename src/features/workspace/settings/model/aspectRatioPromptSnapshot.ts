// src/features/workspace/settings/model/aspectRatioPromptSnapshot.ts
// opening-snapshot helpers for the mixed-ratio prompt target set

import type {
  BoardSnapshot,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import {
  findMismatchedItems,
  getBoardItemAspectRatio,
  itemHasAspectMismatch,
} from '~/shared/board-ui/aspectRatio'

type PromptBoard = Pick<BoardSnapshot, 'items' | 'itemAspectRatio'>

export interface AspectRatioPromptSnapshot
{
  itemIds: readonly ItemId[]
}

export const createAspectRatioPromptSnapshot = (
  board: PromptBoard
): AspectRatioPromptSnapshot => ({
  itemIds: findMismatchedItems(board).map((item) => item.id),
})

export const resolveAspectRatioPromptItems = (
  snapshot: AspectRatioPromptSnapshot,
  board: PromptBoard
): TierItem[] =>
{
  const boardRatio = getBoardItemAspectRatio(board)
  return snapshot.itemIds
    .map((id) => board.items[id])
    .filter(
      (item): item is TierItem =>
        !!item && itemHasAspectMismatch(item, boardRatio)
    )
}
