// src/features/workspace/settings/model/aspect-ratio/aspectRatioPromptSnapshot.ts
// opening-snapshot helpers for the mixed-ratio prompt target set

import type {
  BoardSnapshot,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import { findMismatchedItems } from '~/shared/board-ui/aspectRatio'

type PromptBoard = Pick<BoardSnapshot, 'items' | 'itemAspectRatio'>

interface AspectRatioPromptSnapshot
{
  itemIds: readonly ItemId[]
}

interface AspectRatioPromptResolution
{
  // currently mismatched items in the live board state
  current: TierItem[]
  // items the modal acts on: snapshot ids preserved (so cleanup persists even
  // when the picked ratio resolves a mismatch) ∪ currently mismatched items
  cleanup: TierItem[]
}

export const createAspectRatioPromptSnapshot = (
  board: PromptBoard
): AspectRatioPromptSnapshot => ({
  itemIds: findMismatchedItems(board).map((item) => item.id),
})

export const resolveAspectRatioPromptItems = (
  snapshot: AspectRatioPromptSnapshot,
  board: PromptBoard
): AspectRatioPromptResolution =>
{
  const current = findMismatchedItems(board)
  const cleanup: TierItem[] = []
  const seen = new Set<ItemId>()
  for (const id of snapshot.itemIds)
  {
    const item = board.items[id]
    if (!item || seen.has(id)) continue
    seen.add(id)
    cleanup.push(item)
  }
  for (const item of current)
  {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    cleanup.push(item)
  }
  return { current, cleanup }
}
