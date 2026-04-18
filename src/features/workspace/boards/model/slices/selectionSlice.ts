// src/features/workspace/boards/model/slices/selectionSlice.ts
// selection slice — multi-item selection state & bulk move/delete actions

import { announce } from '~/shared/a11y/announce'
import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import { pluralizeWord } from '~/shared/lib/pluralize'
import {
  EMPTY_SELECTION,
  makeSelection,
} from '~/features/workspace/boards/model/runtime'
import { getAllBoardItemIds, stripItemsFromContainers } from './helpers'
import { withUndo } from './undoSlice'
import type { ActiveBoardSliceCreator, SelectionSlice } from './types'

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

      // shift+click: range selection from last clicked to current
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

      // ctrl/cmd+click: toggle individual item in/out of selection
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

      // plain click: select only this item (clear others)
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
    set((state) =>
    {
      const selected = state.selection.ids
      if (selected.length === 0) return state

      const tier = state.tiers.find((t) => t.id === tierId)
      if (!tier) return state

      const selectedSet = state.selection.set
      const { tiers: strippedTiers, unrankedItemIds } =
        stripItemsFromContainers(state, selectedSet)

      // add selected items to the target tier (in selection order)
      const tiers = strippedTiers.map((t) =>
        t.id === tierId ? { ...t, itemIds: [...t.itemIds, ...selected] } : t
      )

      announce(
        `Moved ${selected.length} ${pluralizeWord(selected.length, 'item')} to ${tier.name}`
      )

      const moveLabel =
        selected.length === 1
          ? `Move item to ${tier.name}`
          : `Move ${selected.length} items to ${tier.name}`

      return {
        ...withUndo(state, { tiers, unrankedItemIds }, moveLabel),
        selection: EMPTY_SELECTION,
        lastClickedItemId: null,
      }
    }),

  moveSelectedToUnranked: () =>
    set((state) =>
    {
      const selected = state.selection.ids
      if (selected.length === 0) return state

      const selectedSet = state.selection.set
      const { tiers, unrankedItemIds: strippedUnranked } =
        stripItemsFromContainers(state, selectedSet)
      // remove from unranked first (prevent duplicates), then re-add in selection order
      const unrankedItemIds = [...strippedUnranked, ...selected]

      announce(
        `Moved ${selected.length} ${pluralizeWord(selected.length, 'item')} to unranked`
      )

      const moveLabel =
        selected.length === 1
          ? 'Move item to unranked'
          : `Move ${selected.length} items to unranked`

      return {
        ...withUndo(state, { tiers, unrankedItemIds }, moveLabel),
        selection: EMPTY_SELECTION,
        lastClickedItemId: null,
      }
    }),

  deleteSelectedItems: () =>
    set((state) =>
    {
      const selected = state.selection.ids
      if (selected.length === 0) return state

      const selectedSet = state.selection.set
      const { tiers, unrankedItemIds } = stripItemsFromContainers(
        state,
        selectedSet
      )

      const deletedItems = [...state.deletedItems]
      for (const id of selected)
      {
        const item = state.items[id]
        if (item) deletedItems.push(item)
      }

      const items = { ...state.items }
      for (const id of selected)
      {
        delete items[id]
      }

      announce(
        `Deleted ${selected.length} ${pluralizeWord(selected.length, 'item')}`
      )

      const deleteLabel =
        selected.length === 1
          ? 'Delete item'
          : `Delete ${selected.length} items`

      return {
        ...withUndo(
          state,
          { tiers, unrankedItemIds, items, deletedItems },
          deleteLabel
        ),
        selection: EMPTY_SELECTION,
        lastClickedItemId: null,
      }
    }),
})
