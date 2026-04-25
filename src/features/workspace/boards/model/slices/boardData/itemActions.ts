// src/features/workspace/boards/model/slices/boardData/itemActions.ts
// live-item action group for add, edit, remove, clear, sort, & shuffle

import { announce } from '~/shared/a11y/announce'
import { isPresent } from '~/shared/lib/typeGuards'
import { formatCountedWord } from '~/shared/lib/pluralize'
import {
  shuffleAllBoardItems,
  shuffleUnrankedItems as shuffleUnrankedBoardItems,
  sortTierItemsByName as sortTierItemsByNameInBoard,
} from '~/features/workspace/boards/model/boardOps'
import {
  computeAutoBoardAspectRatio,
  getBoardAspectRatioMode,
} from '~/features/workspace/boards/lib/aspectRatio'
import { generateItemId, type ItemId } from '@tierlistbuilder/contracts/lib/ids'
import { MAX_DELETED_ITEMS } from '../helpers'
import { withUndo } from '../undoSlice'
import { buildRemoveItemsPatch } from './itemRemoval'
import type { ActiveBoardSliceCreator, BoardDataSlice } from '../types'

type ItemActions = Pick<
  BoardDataSlice,
  | 'addItems'
  | 'addTextItem'
  | 'setItemAltText'
  | 'removeItem'
  | 'removeItems'
  | 'clearAllItems'
  | 'sortTierItemsByName'
  | 'shuffleAllItems'
  | 'shuffleUnrankedItems'
>

type SliceArgs = Parameters<ActiveBoardSliceCreator<BoardDataSlice>>

export const createItemActions = (
  set: SliceArgs[0],
  get: SliceArgs[1]
): ItemActions => ({
  addItems: (newItems) =>
  {
    set((state) =>
    {
      const nextItems = { ...state.items }
      const nextUnranked: ItemId[] = [...state.unrankedItemIds]

      for (const newItem of newItems)
      {
        const id = generateItemId()
        nextItems[id] = {
          id,
          imageRef: newItem.imageRef,
          sourceImageRef: newItem.sourceImageRef,
          label: newItem.label,
          backgroundColor: newItem.backgroundColor,
          aspectRatio: newItem.aspectRatio,
        }
        nextUnranked.push(id)
      }

      const label =
        newItems.length === 1
          ? 'Add item'
          : `Add ${formatCountedWord(newItems.length, 'item')}`

      let nextAspectRatio = state.itemAspectRatio
      if (getBoardAspectRatioMode(state) === 'auto')
      {
        const computed = computeAutoBoardAspectRatio({ items: nextItems })
        if (computed != null) nextAspectRatio = computed
      }

      return {
        ...withUndo(state, {}, label),
        items: nextItems,
        unrankedItemIds: nextUnranked,
        itemAspectRatio: nextAspectRatio,
      }
    })
    announce(`${formatCountedWord(newItems.length, 'item')} added`)
  },

  addTextItem: (label, backgroundColor) =>
    set((state) =>
    {
      const id = generateItemId()

      return {
        ...withUndo(state, {}, 'Add item'),
        items: {
          ...state.items,
          [id]: { id, label, backgroundColor },
        },
        unrankedItemIds: [...state.unrankedItemIds, id],
      }
    }),

  setItemAltText: (itemId, altText) =>
    set((state) =>
    {
      const item = state.items[itemId]
      if (!item) return state

      const nextAltText = altText.trim() || undefined
      if (nextAltText === item.altText) return state

      return withUndo(
        state,
        {
          items: {
            ...state.items,
            [itemId]: { ...item, altText: nextAltText },
          },
        },
        'Edit item'
      )
    }),

  removeItem: (itemId) =>
  {
    const item = get().items[itemId]
    if (!item) return

    const label = item.label || 'item'
    set(
      (state) => buildRemoveItemsPatch(state, [itemId], 'Delete item') ?? state
    )
    announce(`${label} removed`)
  },

  removeItems: (itemIds) =>
    set((state) =>
    {
      const uniqueIds = [...new Set(itemIds)].filter((id) => state.items[id])
      const deleteLabel =
        uniqueIds.length === 1
          ? 'Delete item'
          : `Delete ${formatCountedWord(uniqueIds.length, 'item')}`

      return buildRemoveItemsPatch(state, uniqueIds, deleteLabel) ?? state
    }),

  clearAllItems: () =>
    set((state) =>
    {
      const allItemIds: ItemId[] = [
        ...state.tiers.flatMap((tier) => tier.itemIds),
        ...state.unrankedItemIds,
      ]

      if (allItemIds.length === 0)
      {
        return state
      }

      const clearedItems = allItemIds
        .map((itemId) => state.items[itemId])
        .filter(isPresent)
      const nextDeleted = [...clearedItems, ...state.deletedItems].slice(
        0,
        MAX_DELETED_ITEMS
      )
      const nextItems = { ...state.items }

      for (const itemId of allItemIds)
      {
        delete nextItems[itemId]
      }

      return {
        ...withUndo(state, {}, 'Clear items'),
        items: nextItems,
        deletedItems: nextDeleted,
        tiers: state.tiers.map((tier) => ({ ...tier, itemIds: [] })),
        unrankedItemIds: [],
      }
    }),

  sortTierItemsByName: (tierId) =>
    set((state) =>
    {
      const nextTiers = sortTierItemsByNameInBoard(
        state.tiers,
        tierId,
        state.items
      )

      if (!nextTiers)
      {
        return state
      }

      return withUndo(
        state,
        {
          tiers: nextTiers,
        },
        'Sort tier'
      )
    }),

  shuffleAllItems: (mode) =>
    set((state) =>
    {
      const shuffled = shuffleAllBoardItems(
        state.tiers,
        state.unrankedItemIds,
        mode
      )

      if (!shuffled)
      {
        return state
      }

      return {
        ...withUndo(
          state,
          {
            tiers: shuffled.tiers,
            unrankedItemIds: shuffled.unrankedItemIds,
          },
          'Shuffle items'
        ),
        itemsManuallyMoved: false,
      }
    }),

  shuffleUnrankedItems: () =>
    set((state) =>
    {
      const shuffled = shuffleUnrankedBoardItems(
        state.tiers,
        state.unrankedItemIds
      )

      if (!shuffled)
      {
        return state
      }

      return {
        ...withUndo(
          state,
          {
            tiers: shuffled.tiers,
            unrankedItemIds: shuffled.unrankedItemIds,
          },
          'Shuffle unranked'
        ),
        itemsManuallyMoved: false,
      }
    }),
})
