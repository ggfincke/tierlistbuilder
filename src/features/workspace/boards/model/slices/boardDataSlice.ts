// src/features/workspace/boards/model/slices/boardDataSlice.ts
// board data slice — tiers, items, unranked pool, deleted buffer, & CRUD actions

import { announce } from '~/shared/a11y/announce'
import { clamp } from '~/shared/lib/math'
import { isPresent } from '~/shared/lib/typeGuards'
import { areTierColorSpecsEqual } from '~/shared/theme/tierColors'
import {
  createInitialBoardData,
  createNewTier,
  resetBoardData,
} from '~/features/workspace/boards/model/boardSnapshot'
import {
  shuffleAllBoardItems,
  shuffleUnrankedItems as shuffleUnrankedBoardItems,
  sortTierItemsByName as sortTierItemsByNameInBoard,
} from '~/features/workspace/boards/model/boardOps'
import {
  computeAutoBoardAspectRatio,
  getBoardAspectRatioMode,
} from '~/features/workspace/boards/lib/aspectRatio'
import { createFreshRuntimeState } from '~/features/workspace/boards/model/runtime'
import {
  EMPTY_BOARD_SYNC_STATE,
  extractBoardSyncState,
} from '~/features/workspace/boards/model/sync'
import { generateItemId, type ItemId } from '@tierlistbuilder/contracts/lib/ids'
import { MAX_DELETED_ITEMS, runtimeCleanupForItem } from './helpers'
import { mapTier, pushUndo, withUndo } from './undoSlice'
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
  ...EMPTY_BOARD_SYNC_STATE,
  runtimeError: null,

  setSyncState: (state) => set(state),

  setRuntimeError: (message) =>
    set((state) =>
      state.runtimeError === message ? state : { runtimeError: message }
    ),

  clearRuntimeError: () =>
    set((state) =>
      state.runtimeError === null ? state : { runtimeError: null }
    ),

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
    set(
      (state) =>
        mapTier(state, tierId, 'Rename tier', (tier) =>
        {
          const nextName = name.trim() || tier.name
          return nextName === tier.name ? null : { ...tier, name: nextName }
        }) ?? state
    ),

  setTierDescription: (tierId, description) =>
    set(
      (state) =>
        mapTier(state, tierId, 'Edit tier description', (tier) =>
        {
          const nextDescription = description.trim() || undefined
          return nextDescription === tier.description
            ? null
            : { ...tier, description: nextDescription }
        }) ?? state
    ),

  recolorTier: (tierId, colorSpec) =>
    set(
      (state) =>
        mapTier(state, tierId, 'Recolor tier', (tier) =>
          areTierColorSpecsEqual(tier.colorSpec, colorSpec)
            ? null
            : { ...tier, colorSpec }
        ) ?? state
    ),

  recolorTierRow: (tierId, rowColorSpec) =>
    set(
      (state) =>
        mapTier(
          state,
          tierId,
          rowColorSpec === null ? 'Clear row color' : 'Recolor row',
          (tier) =>
          {
            // no-op when resetting an already-absent row color or reselecting
            // the same semantic color value
            if (
              (rowColorSpec === null && tier.rowColorSpec === undefined) ||
              areTierColorSpecsEqual(tier.rowColorSpec, rowColorSpec)
            )
            {
              return null
            }
            if (rowColorSpec === null)
            {
              // drop the field entirely so normalized snapshots stay compact
              const { rowColorSpec: _rowColorSpec, ...rest } = tier
              return rest
            }
            return { ...tier, rowColorSpec }
          }
        ) ?? state
    ),

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
          label: newItem.label,
          backgroundColor: newItem.backgroundColor,
          aspectRatio: newItem.aspectRatio,
        }
        nextUnranked.push(id)
      }

      const label =
        newItems.length === 1 ? 'Add item' : `Add ${newItems.length} items`

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

  resetBoard: (paletteId) =>
    set((state) => ({
      ...resetBoardData(state, paletteId),
      ...createFreshRuntimeState(),
      ...extractBoardSyncState(state),
    })),

  loadBoard: (data, syncState = EMPTY_BOARD_SYNC_STATE) =>
    set(() => ({
      ...data,
      ...createFreshRuntimeState(),
      ...syncState,
    })),

  setBoardItemAspectRatio: (value) =>
    set((state) =>
    {
      if (!Number.isFinite(value) || value <= 0) return state
      if (
        state.itemAspectRatioMode === 'manual' &&
        state.itemAspectRatio === value
      )
      {
        return state
      }
      return withUndo(
        state,
        {
          itemAspectRatio: value,
          itemAspectRatioMode: 'manual',
        },
        'Set aspect ratio'
      )
    }),

  setBoardAspectRatioMode: (mode) =>
    set((state) =>
    {
      const currentMode = getBoardAspectRatioMode(state)
      if (mode === currentMode) return state
      if (mode === 'manual')
      {
        return withUndo(
          state,
          { itemAspectRatioMode: 'manual' },
          'Pin aspect ratio'
        )
      }
      const computed = computeAutoBoardAspectRatio(state)
      return withUndo(
        state,
        {
          itemAspectRatioMode: 'auto',
          itemAspectRatio: computed ?? state.itemAspectRatio,
        },
        'Auto aspect ratio'
      )
    }),

  setItemImageFit: (itemId, fit) =>
    set((state) =>
    {
      const item = state.items[itemId]
      if (!item) return state
      const nextFit = fit ?? undefined
      if (nextFit === item.imageFit) return state
      return withUndo(
        state,
        {
          items: {
            ...state.items,
            [itemId]: { ...item, imageFit: nextFit },
          },
        },
        'Change image fit'
      )
    }),

  setItemsImageFit: (itemIds, fit) =>
    set((state) =>
    {
      if (itemIds.length === 0) return state
      const nextFit = fit ?? undefined
      const nextItems = { ...state.items }
      let changed = false
      for (const id of itemIds)
      {
        const item = nextItems[id]
        if (!item || nextFit === item.imageFit) continue
        nextItems[id] = { ...item, imageFit: nextFit }
        changed = true
      }
      if (!changed) return state
      return withUndo(state, { items: nextItems }, 'Change image fit')
    }),

  // silent — no undo entry; undefined-on-false keeps snapshots compact
  setAspectRatioPromptDismissed: (dismissed) =>
    set((state) =>
    {
      const current = state.aspectRatioPromptDismissed === true
      if (current === dismissed) return state
      return { aspectRatioPromptDismissed: dismissed ? true : undefined }
    }),

  setDefaultItemImageFit: (fit) =>
    set((state) =>
    {
      const nextFit = fit ?? undefined
      if (nextFit === state.defaultItemImageFit) return state
      return withUndo(
        state,
        { defaultItemImageFit: nextFit },
        'Set default fit'
      )
    }),
})
