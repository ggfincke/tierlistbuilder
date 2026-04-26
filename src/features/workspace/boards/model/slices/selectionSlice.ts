// src/features/workspace/boards/model/slices/selectionSlice.ts
// selection slice — multi-item selection state & bulk move/delete actions

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import { announce } from '~/shared/a11y/announce'
import {
  EMPTY_SELECTION,
  makeSelection,
} from '~/features/workspace/boards/model/runtime'
import { getAllBoardItemIds } from './helpers'
import {
  buildSelectedItemsDelete,
  buildSelectedItemsMove,
} from './selectionBulkOps'
import type {
  ActiveBoardSliceCreator,
  ActiveBoardStore,
  SelectionSlice,
} from './types'

type SelectionMutation = NonNullable<
  ReturnType<typeof buildSelectedItemsDelete>
>
type SelectionMutationBuilder = (
  state: ActiveBoardStore
) => SelectionMutation | null
type SelectionSet = Parameters<ActiveBoardSliceCreator<SelectionSlice>>[0]

const runBulkSelection = (
  set: SelectionSet,
  buildMutation: SelectionMutationBuilder
): void =>
{
  let announcement: string | null = null
  set((state) =>
  {
    const mutation = buildMutation(state)
    if (!mutation) return state
    announcement = mutation.announcement
    return mutation.patch
  })
  if (announcement) announce(announcement)
}

export const createSelectionSlice: ActiveBoardSliceCreator<SelectionSlice> = (
  set
) => ({
  selection: EMPTY_SELECTION,
  lastClickedItemId: null,

  toggleItemSelected: (itemId, shiftKey, modKey) =>
    set((state) =>
    {
      const prev = state.selection.ids
      const idx = prev.indexOf(itemId)

      if (shiftKey && state.lastClickedItemId)
      {
        const allIds = getAllBoardItemIds(state)
        const startIdx = allIds.indexOf(state.lastClickedItemId)
        const endIdx = allIds.indexOf(itemId)

        if (startIdx !== -1 && endIdx !== -1)
        {
          const [from, to] =
            startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx]
          const next: ItemId[] = modKey ? [...prev] : []
          for (let i = from; i <= to; i++)
          {
            if (!next.includes(allIds[i])) next.push(allIds[i])
          }
          return {
            selection: makeSelection(next),
            lastClickedItemId: state.lastClickedItemId,
          }
        }
      }

      if (modKey)
      {
        if (idx !== -1)
        {
          return {
            selection: makeSelection(prev.filter((id) => id !== itemId)),
            lastClickedItemId: itemId,
          }
        }
        return {
          selection: makeSelection([...prev, itemId]),
          lastClickedItemId: itemId,
        }
      }

      // bail if already the sole selection to avoid a no-op state change
      // that triggers DndContext remeasure loops
      if (prev.length === 1 && prev[0] === itemId) return state
      return {
        selection: makeSelection([itemId]),
        lastClickedItemId: itemId,
      }
    }),

  clearSelection: () =>
    set((state) =>
    {
      if (state.selection.ids.length === 0) return state
      return { selection: EMPTY_SELECTION, lastClickedItemId: null }
    }),

  selectAll: () =>
    set((state) =>
    {
      const allIds = getAllBoardItemIds(state)
      const current = state.selection.ids

      // bail if every item is already selected to avoid no-op state change
      if (
        allIds.length === current.length &&
        allIds.every((id, i) => current[i] === id)
      )
      {
        return state
      }
      return { selection: makeSelection(allIds) }
    }),

  moveSelectedToTier: (tierId) =>
    runBulkSelection(set, (state) =>
      buildSelectedItemsMove(state, { kind: 'tier', tierId })
    ),

  moveSelectedToUnranked: () =>
    runBulkSelection(set, (state) =>
      buildSelectedItemsMove(state, { kind: 'unranked' })
    ),

  deleteSelectedItems: () => runBulkSelection(set, buildSelectedItemsDelete),
})
