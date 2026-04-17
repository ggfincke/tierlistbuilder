// src/features/workspace/boards/model/slices/boardDataSlice.ts
// board data slice — tiers, items, unranked pool, deleted buffer, & CRUD actions

import { announce } from '~/shared/a11y/announce'
import { clamp } from '~/shared/lib/math'
import { generateItemId } from '~/shared/lib/id'
import { areTierColorSpecsEqual } from '~/shared/theme/tierColors'
import {
  createInitialBoardData,
  createNewTier,
  extractBoardData,
  resetBoardData,
} from '~/features/workspace/boards/model/boardSnapshot'
import {
  shuffleAllBoardItems,
  shuffleUnrankedItems as shuffleUnrankedBoardItems,
  sortTierItemsByName as sortTierItemsByNameInBoard,
} from '~/features/workspace/boards/model/boardOps'
import { freshRuntimeState } from '~/features/workspace/boards/model/runtime'
import {
  EMPTY_BOARD_SYNC_STATE,
  extractBoardSyncState,
} from '~/features/workspace/boards/model/sync'
import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import { MAX_DELETED_ITEMS, runtimeCleanupForItem } from './helpers'
import { pushUndo, withUndo } from './undoSlice'
import type {
  ActiveBoardSliceCreator,
  ActiveBoardStore,
  BoardDataSlice,
} from './types'

// reorder a tier between two indices, ignoring out-of-range & identity moves
const reorderTiersByIndex = (
  state: ActiveBoardStore,
  fromIndex: number,
  toIndex: number
): Partial<ActiveBoardStore> =>
{
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    fromIndex >= state.tiers.length ||
    toIndex < 0 ||
    toIndex >= state.tiers.length
  )
  {
    return state
  }

  const nextTiers = [...state.tiers]
  const [moved] = nextTiers.splice(fromIndex, 1)
  nextTiers.splice(toIndex, 0, moved)

  return withUndo(state, { tiers: nextTiers }, 'Reorder tiers')
}

export const createBoardDataSlice: ActiveBoardSliceCreator<BoardDataSlice> = (
  set,
  get
) => ({
  ...createInitialBoardData('classic'),
  itemsManuallyMoved: false,

  addTier: (paletteId) =>
  {
    set((state) =>
      withUndo(
        state,
        {
          tiers: [...state.tiers, createNewTier(paletteId, state.tiers.length)],
        },
        'Add tier'
      )
    )
    announce('Tier added')
  },

  renameTier: (tierId, name) =>
    set((state) =>
    {
      const tier = state.tiers.find((entry) => entry.id === tierId)
      if (!tier) return state

      const nextName = name.trim() || tier.name
      if (nextName === tier.name) return state

      return withUndo(
        state,
        {
          tiers: state.tiers.map((entry) =>
            entry.id === tierId ? { ...entry, name: nextName } : entry
          ),
        },
        'Rename tier'
      )
    }),

  setTierDescription: (tierId, description) =>
    set((state) =>
    {
      const tier = state.tiers.find((entry) => entry.id === tierId)
      if (!tier) return state

      const nextDescription = description.trim() || undefined
      if (nextDescription === tier.description) return state

      return withUndo(
        state,
        {
          tiers: state.tiers.map((entry) =>
            entry.id === tierId
              ? { ...entry, description: nextDescription }
              : entry
          ),
        },
        'Edit tier description'
      )
    }),

  recolorTier: (tierId, colorSpec) =>
    set((state) =>
    {
      const tier = state.tiers.find((entry) => entry.id === tierId)
      if (!tier || areTierColorSpecsEqual(tier.colorSpec, colorSpec))
        return state

      return withUndo(
        state,
        {
          tiers: state.tiers.map((entry) =>
            entry.id === tierId ? { ...entry, colorSpec } : entry
          ),
        },
        'Recolor tier'
      )
    }),

  recolorTierRow: (tierId, rowColorSpec) =>
    set((state) =>
    {
      const tier = state.tiers.find((entry) => entry.id === tierId)
      if (!tier) return state

      // no-op when resetting an already-absent row color or reselecting the
      // same semantic color value
      if (
        (rowColorSpec === null && tier.rowColorSpec === undefined) ||
        areTierColorSpecsEqual(tier.rowColorSpec, rowColorSpec)
      )
      {
        return state
      }

      return withUndo(
        state,
        {
          tiers: state.tiers.map((entry) =>
          {
            if (entry.id !== tierId) return entry
            if (rowColorSpec === null)
            {
              // drop the field entirely so normalized snapshots stay compact
              const { rowColorSpec: _rowColorSpec, ...rest } = entry
              return rest
            }
            return { ...entry, rowColorSpec }
          }),
        },
        rowColorSpec === null ? 'Clear row color' : 'Recolor row'
      )
    }),

  reorderTier: (tierId, direction) =>
    set((state) =>
    {
      const tierIndex = state.tiers.findIndex((tier) => tier.id === tierId)

      if (tierIndex < 0)
      {
        return state
      }

      const targetIndex = direction === 'up' ? tierIndex - 1 : tierIndex + 1

      return reorderTiersByIndex(state, tierIndex, targetIndex)
    }),

  reorderTierByIndex: (fromIndex, toIndex) =>
    set((state) => reorderTiersByIndex(state, fromIndex, toIndex)),

  deleteTier: (tierId) =>
  {
    const tierName = get().tiers.find((t) => t.id === tierId)?.name
    set((state) =>
    {
      if (state.tiers.length <= 1)
      {
        return {
          runtimeError: 'At least one tier must remain.',
        }
      }

      const tier = state.tiers.find((entry) => entry.id === tierId)

      if (!tier)
      {
        return state
      }

      return {
        ...withUndo(state, {}, 'Delete tier'),
        tiers: state.tiers.filter((entry) => entry.id !== tierId),
        unrankedItemIds: [...tier.itemIds, ...state.unrankedItemIds],
      }
    })
    announce(`Tier ${tierName ?? ''} deleted`)
  },

  clearTierItems: (tierId) =>
    set((state) =>
    {
      const tier = state.tiers.find((entry) => entry.id === tierId)

      if (!tier || tier.itemIds.length === 0)
      {
        return state
      }

      return {
        ...withUndo(state, {}, 'Clear tier'),
        tiers: state.tiers.map((entry) =>
          entry.id === tierId ? { ...entry, itemIds: [] } : entry
        ),
        unrankedItemIds: [...tier.itemIds, ...state.unrankedItemIds],
      }
    }),

  addTierAt: (index, paletteId) =>
    set((state) =>
    {
      const clampedIndex = clamp(index, 0, state.tiers.length)
      const nextTiers = [...state.tiers]
      nextTiers.splice(
        clampedIndex,
        0,
        createNewTier(paletteId, state.tiers.length)
      )

      return withUndo(state, { tiers: nextTiers }, 'Add tier')
    }),

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
          imageUrl: newItem.imageUrl,
          label: newItem.label,
          backgroundColor: newItem.backgroundColor,
        }
        nextUnranked.push(id)
      }

      const label =
        newItems.length === 1 ? 'Add item' : `Add ${newItems.length} items`

      return {
        ...withUndo(state, {}, label),
        items: nextItems,
        unrankedItemIds: nextUnranked,
      }
    })
    announce(`${newItems.length} item${newItems.length === 1 ? '' : 's'} added`)
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
    const label = get().items[itemId]?.label ?? 'item'
    set((state) =>
    {
      const undo = pushUndo(state, 'Delete item') ?? {}
      const deletedItem = state.items[itemId]
      const nextItems = { ...state.items }
      delete nextItems[itemId]
      const nextDeleted = deletedItem
        ? [deletedItem, ...state.deletedItems].slice(0, MAX_DELETED_ITEMS)
        : state.deletedItems

      const runtimeCleanup = runtimeCleanupForItem(state, itemId)

      if (state.unrankedItemIds.includes(itemId))
      {
        return {
          ...undo,
          items: nextItems,
          deletedItems: nextDeleted,
          ...runtimeCleanup,
          unrankedItemIds: state.unrankedItemIds.filter((id) => id !== itemId),
        }
      }

      const ownerTier = state.tiers.find((tier) =>
        tier.itemIds.includes(itemId)
      )

      if (!ownerTier)
      {
        return {
          ...undo,
          items: nextItems,
          deletedItems: nextDeleted,
        }
      }

      return {
        ...undo,
        items: nextItems,
        deletedItems: nextDeleted,
        ...runtimeCleanup,
        tiers: state.tiers.map((tier) =>
          tier.id === ownerTier.id
            ? { ...tier, itemIds: tier.itemIds.filter((id) => id !== itemId) }
            : tier
        ),
      }
    })
    announce(`${label} removed`)
  },

  restoreDeletedItem: (itemId) =>
    set((state) =>
    {
      const item = state.deletedItems.find((entry) => entry.id === itemId)

      if (!item)
      {
        return state
      }

      return {
        ...withUndo(state, {}, 'Restore item'),
        items: { ...state.items, [item.id]: item },
        unrankedItemIds: [...state.unrankedItemIds, item.id],
        deletedItems: state.deletedItems.filter((entry) => entry.id !== itemId),
      }
    }),

  permanentlyDeleteItem: (itemId) =>
    set((state) =>
      withUndo(
        state,
        {
          deletedItems: state.deletedItems.filter(
            (entry) => entry.id !== itemId
          ),
        },
        'Discard item'
      )
    ),

  clearDeletedItems: () =>
    set((state) =>
      withUndo(
        state,
        {
          deletedItems: [],
        },
        'Empty trash'
      )
    ),

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
        .filter(Boolean)
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

  resetBoard: (paletteId) =>
    set((state) => ({
      ...resetBoardData(state, paletteId),
      ...freshRuntimeState,
      ...extractBoardSyncState(state),
    })),

  loadBoard: (data, syncState = EMPTY_BOARD_SYNC_STATE) =>
    set(() => ({
      ...data,
      ...freshRuntimeState,
      ...syncState,
    })),
})

// expose extractBoardData for autosave consumers; re-exported here so the
// board data module owns the canonical serialization path
export { extractBoardData }
