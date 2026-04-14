// src/features/workspace/boards/model/slices/selectionSlice.ts
// selection slice — multi-item selection state & bulk move/delete actions

import { announce } from '@/shared/a11y/announce'
import type { ItemId } from '@/shared/types/ids'
import { getAllBoardItemIds, selectionUpdate } from './helpers'
import { withUndo } from './undoSlice'
import type { ActiveBoardSliceCreator, SelectionSlice } from './types'

export const createSelectionSlice: ActiveBoardSliceCreator<SelectionSlice> = (
  set
) => ({
  selectedItemIds: [],
  selectedItemIdSet: new Set<ItemId>(),
  lastClickedItemId: null,

  toggleItemSelected: (itemId, shiftKey, modKey) =>
    set((state) =>
    {
      const prev = state.selectedItemIds
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
          const next = modKey ? [...prev] : []
          for (let i = from; i <= to; i++)
          {
            if (!next.includes(allIds[i])) next.push(allIds[i])
          }
          return {
            ...selectionUpdate(next),
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
            ...selectionUpdate(prev.filter((id) => id !== itemId)),
            lastClickedItemId: itemId,
          }
        }
        return {
          ...selectionUpdate([...prev, itemId]),
          lastClickedItemId: itemId,
        }
      }

      // plain click: select only this item (clear others)
      // bail if already the sole selection to avoid a no-op state change
      // that triggers DndContext remeasure loops
      if (prev.length === 1 && prev[0] === itemId) return state
      return {
        ...selectionUpdate([itemId]),
        lastClickedItemId: itemId,
      }
    }),

  clearSelection: () =>
    set((state) =>
    {
      if (state.selectedItemIds.length === 0) return state
      return { ...selectionUpdate([]), lastClickedItemId: null }
    }),

  selectAll: () =>
    set((state) =>
    {
      const allIds = getAllBoardItemIds(state)
      // bail if every item is already selected to avoid no-op state change
      if (
        allIds.length === state.selectedItemIds.length &&
        allIds.every((id, i) => state.selectedItemIds[i] === id)
      )
      {
        return state
      }
      return selectionUpdate(allIds)
    }),

  moveSelectedToTier: (tierId) =>
    set((state) =>
    {
      const selected = state.selectedItemIds
      if (selected.length === 0) return state

      const tier = state.tiers.find((t) => t.id === tierId)
      if (!tier) return state

      const selectedSet = new Set(selected)

      // remove selected items from all tiers & unranked
      const tiers = state.tiers.map((t) => ({
        ...t,
        itemIds: t.itemIds.filter((id) => !selectedSet.has(id)),
      }))
      const unrankedItemIds = state.unrankedItemIds.filter(
        (id) => !selectedSet.has(id)
      )

      // add selected items to the target tier (in selection order)
      const targetIdx = tiers.findIndex((t) => t.id === tierId)
      if (targetIdx !== -1)
      {
        tiers[targetIdx] = {
          ...tiers[targetIdx],
          itemIds: [...tiers[targetIdx].itemIds, ...selected],
        }
      }

      announce(
        `Moved ${selected.length} item${selected.length > 1 ? 's' : ''} to ${tier.name}`
      )

      return {
        ...withUndo(state, { tiers, unrankedItemIds }),
        ...selectionUpdate([]),
        lastClickedItemId: null,
      }
    }),

  moveSelectedToUnranked: () =>
    set((state) =>
    {
      const selected = state.selectedItemIds
      if (selected.length === 0) return state

      const selectedSet = new Set(selected)

      const tiers = state.tiers.map((t) => ({
        ...t,
        itemIds: t.itemIds.filter((id) => !selectedSet.has(id)),
      }))
      // remove from unranked first (prevent duplicates), then re-add
      const unrankedItemIds = [
        ...state.unrankedItemIds.filter((id) => !selectedSet.has(id)),
        ...selected,
      ]

      announce(
        `Moved ${selected.length} item${selected.length > 1 ? 's' : ''} to unranked`
      )

      return {
        ...withUndo(state, { tiers, unrankedItemIds }),
        ...selectionUpdate([]),
        lastClickedItemId: null,
      }
    }),

  deleteSelectedItems: () =>
    set((state) =>
    {
      const selected = state.selectedItemIds
      if (selected.length === 0) return state

      const selectedSet = new Set(selected)

      const tiers = state.tiers.map((t) => ({
        ...t,
        itemIds: t.itemIds.filter((id) => !selectedSet.has(id)),
      }))
      const unrankedItemIds = state.unrankedItemIds.filter(
        (id) => !selectedSet.has(id)
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
        `Deleted ${selected.length} item${selected.length > 1 ? 's' : ''}`
      )

      return {
        ...withUndo(state, { tiers, unrankedItemIds, items, deletedItems }),
        ...selectionUpdate([]),
        lastClickedItemId: null,
      }
    }),
})
