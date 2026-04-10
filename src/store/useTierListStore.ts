// src/store/useTierListStore.ts
// * active board store — board data plus transient drag, keyboard, undo, & error state

import { create } from 'zustand'

import { announce } from '../utils/announce'
import type {
  ContainerSnapshot,
  KeyboardMode,
  NewTierItem,
  PaletteId,
  TierColorSpec,
  TierListData,
} from '../types'
import { clampIndex } from '../utils/constants'
import { generateItemId } from '../utils/id'
import {
  applyContainerSnapshotToTiers,
  createContainerSnapshot,
  isSnapshotConsistent,
} from '../utils/dragSnapshot'
import {
  createInitialBoardData,
  createNewTier,
  extractBoardData,
  resetBoardData,
} from '../domain/boardData'
import {
  shuffleAllBoardItems,
  shuffleUnrankedItems,
  sortTierItemsByName as sortTierItemsByNameInBoard,
} from '../domain/boardOps'
import {
  freshRuntimeState,
  type TierListStoreRuntimeState,
} from '../domain/tierListRuntime'

interface TierListStore extends TierListStoreRuntimeState
{
  setActiveItemId: (itemId: string | null) => void
  setKeyboardMode: (mode: KeyboardMode) => void
  setKeyboardFocusItemId: (itemId: string | null) => void
  clearKeyboardMode: () => void
  setRuntimeError: (message: string) => void
  clearRuntimeError: () => void
  addTier: (paletteId: PaletteId) => void
  renameTier: (tierId: string, name: string) => void
  setTierDescription: (tierId: string, description: string) => void
  recolorTier: (tierId: string, colorSpec: TierColorSpec) => void
  reorderTier: (tierId: string, direction: 'up' | 'down') => void
  reorderTierByIndex: (fromIndex: number, toIndex: number) => void
  deleteTier: (tierId: string) => void
  clearTierItems: (tierId: string) => void
  addTierAt: (index: number, paletteId: PaletteId) => void
  addItems: (newItems: NewTierItem[]) => void
  addTextItem: (label: string, backgroundColor: string) => void
  setItemAltText: (itemId: string, altText: string) => void
  removeItem: (itemId: string) => void
  restoreDeletedItem: (itemId: string) => void
  permanentlyDeleteItem: (itemId: string) => void
  clearDeletedItems: () => void
  clearAllItems: () => void
  beginDragPreview: (activeId?: string) => void
  updateDragPreview: (preview: ContainerSnapshot) => void
  commitDragPreview: () => void
  discardDragPreview: () => void
  undo: () => void
  redo: () => void
  sortTierItemsByName: (tierId: string) => void
  shuffleAllItems: (mode: 'even' | 'random') => void
  shuffleUnrankedItems: () => void
  resetBoard: (paletteId: PaletteId) => void
  loadBoard: (data: TierListData) => void
  toggleItemSelected: (itemId: string, shiftKey: boolean) => void
  clearSelection: () => void
  moveSelectedToTier: (tierId: string) => void
  moveSelectedToUnranked: () => void
  deleteSelectedItems: () => void
}

const pushUndo = (state: TierListStore) => ({
  past: [...state.past, extractBoardData(state)].slice(-50),
  future: [] as TierListData[],
})

const withUndo = (
  state: TierListStore,
  updates: Partial<TierListStore>
): Partial<TierListStore> => ({
  ...pushUndo(state),
  ...updates,
})

const keyboardCleanupForItem = (state: TierListStore, itemId: string) => ({
  activeItemId: state.activeItemId === itemId ? null : state.activeItemId,
  keyboardFocusItemId:
    state.keyboardFocusItemId === itemId ? null : state.keyboardFocusItemId,
  keyboardMode:
    state.keyboardFocusItemId === itemId || state.activeItemId === itemId
      ? ('idle' as KeyboardMode)
      : state.keyboardMode,
})

const reorderTiersByIndex = (
  state: TierListStore,
  fromIndex: number,
  toIndex: number
): Partial<TierListStore> =>
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

  return {
    ...pushUndo(state),
    tiers: nextTiers,
  }
}

export const useTierListStore = create<TierListStore>()((set) => ({
  ...createInitialBoardData('classic'),
  ...freshRuntimeState,

  setActiveItemId: (itemId) => set({ activeItemId: itemId }),

  setKeyboardMode: (mode) => set({ keyboardMode: mode }),

  setKeyboardFocusItemId: (itemId) => set({ keyboardFocusItemId: itemId }),

  clearKeyboardMode: () =>
    set({
      keyboardMode: 'idle',
      keyboardFocusItemId: null,
    }),

  setRuntimeError: (message) => set({ runtimeError: message }),

  clearRuntimeError: () => set({ runtimeError: null }),

  addTier: (paletteId) =>
  {
    set((state) =>
      withUndo(state, {
        tiers: [...state.tiers, createNewTier(paletteId, state.tiers.length)],
      })
    )
    announce('Tier added')
  },

  renameTier: (tierId, name) =>
    set((state) =>
      withUndo(state, {
        tiers: state.tiers.map((tier) =>
          tier.id === tierId
            ? { ...tier, name: name.trim() || tier.name }
            : tier
        ),
      })
    ),

  setTierDescription: (tierId, description) =>
    set((state) =>
      withUndo(state, {
        tiers: state.tiers.map((tier) =>
          tier.id === tierId
            ? { ...tier, description: description.trim() || undefined }
            : tier
        ),
      })
    ),

  recolorTier: (tierId, colorSpec) =>
    set((state) =>
      withUndo(state, {
        tiers: state.tiers.map((tier) =>
          tier.id === tierId ? { ...tier, colorSpec } : tier
        ),
      })
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
    const tierName = useTierListStore
      .getState()
      .tiers.find((t) => t.id === tierId)?.name
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
        ...withUndo(state, {}),
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
        ...withUndo(state, {}),
        tiers: state.tiers.map((entry) =>
          entry.id === tierId ? { ...entry, itemIds: [] } : entry
        ),
        unrankedItemIds: [...tier.itemIds, ...state.unrankedItemIds],
      }
    }),

  addTierAt: (index, paletteId) =>
    set((state) =>
    {
      const clampedIndex = clampIndex(index, 0, state.tiers.length)
      const nextTiers = [...state.tiers]
      nextTiers.splice(
        clampedIndex,
        0,
        createNewTier(paletteId, state.tiers.length)
      )

      return withUndo(state, { tiers: nextTiers })
    }),

  addItems: (newItems) =>
  {
    set((state) =>
    {
      const nextItems = { ...state.items }
      const nextUnranked = [...state.unrankedItemIds]

      for (const newItem of newItems)
      {
        const id = generateItemId()
        nextItems[id] = {
          id,
          imageUrl: newItem.imageUrl,
          label: newItem.label,
          backgroundColor: newItem.backgroundColor,
        }
        nextUnranked.push(id)
      }

      return {
        ...withUndo(state, {}),
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
        ...withUndo(state, {}),
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
      return withUndo(state, {
        items: {
          ...state.items,
          [itemId]: { ...item, altText: altText.trim() || undefined },
        },
      })
    }),

  removeItem: (itemId) =>
  {
    const label = useTierListStore.getState().items[itemId]?.label ?? 'item'
    set((state) =>
    {
      const undo = pushUndo(state)
      const deletedItem = state.items[itemId]
      const nextItems = { ...state.items }
      delete nextItems[itemId]
      const nextDeleted = deletedItem
        ? [deletedItem, ...state.deletedItems].slice(0, 50)
        : state.deletedItems

      const kbCleanup = keyboardCleanupForItem(state, itemId)

      if (state.unrankedItemIds.includes(itemId))
      {
        return {
          ...undo,
          items: nextItems,
          deletedItems: nextDeleted,
          ...kbCleanup,
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
        ...kbCleanup,
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
        ...withUndo(state, {}),
        items: { ...state.items, [item.id]: item },
        unrankedItemIds: [...state.unrankedItemIds, item.id],
        deletedItems: state.deletedItems.filter((entry) => entry.id !== itemId),
      }
    }),

  permanentlyDeleteItem: (itemId) =>
    set((state) =>
      withUndo(state, {
        deletedItems: state.deletedItems.filter((entry) => entry.id !== itemId),
      })
    ),

  clearDeletedItems: () =>
    set((state) =>
      withUndo(state, {
        deletedItems: [],
      })
    ),

  clearAllItems: () =>
    set((state) =>
    {
      const allItemIds = [
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
      const nextDeleted = [...clearedItems, ...state.deletedItems].slice(0, 50)
      const nextItems = { ...state.items }

      for (const itemId of allItemIds)
      {
        delete nextItems[itemId]
      }

      return {
        ...withUndo(state, {}),
        items: nextItems,
        deletedItems: nextDeleted,
        tiers: state.tiers.map((tier) => ({ ...tier, itemIds: [] })),
        unrankedItemIds: [],
      }
    }),

  beginDragPreview: (activeId) =>
    set((state) =>
    {
      if (state.dragPreview) return state

      const selected = state.selectedItemIds
      let dragGroupIds: string[] = []

      if (activeId)
      {
        if (selected.includes(activeId))
        {
          // dragging a selected item — drag entire selection, primary first,
          // then the remaining selected items in selection order; filter out
          // any stale IDs that no longer reference live items
          dragGroupIds = [
            activeId,
            ...selected.filter(
              (id) => id !== activeId && state.items[id] !== undefined
            ),
          ]
        }
        else
        {
          // dragging a non-selected item — single-item drag, even if selection exists
          dragGroupIds = [activeId]
        }
      }

      // create snapshot & remove secondary items from it so their source tiles
      // disappear & visually collapse into the dragged stack
      const snapshot = createContainerSnapshot(state)
      if (dragGroupIds.length > 1)
      {
        const secondaryIds = new Set(dragGroupIds.slice(1))
        for (const tier of snapshot.tiers)
        {
          tier.itemIds = tier.itemIds.filter((id) => !secondaryIds.has(id))
        }
        snapshot.unrankedItemIds = snapshot.unrankedItemIds.filter(
          (id) => !secondaryIds.has(id)
        )
      }

      return {
        dragPreview: snapshot,
        dragGroupIds,
      }
    }),

  updateDragPreview: (preview) =>
    set((state) =>
    {
      if (state.dragPreview === preview)
      {
        return state
      }

      return {
        dragPreview: preview,
      }
    }),

  commitDragPreview: () =>
    set((state) =>
    {
      if (!state.dragPreview) return state

      const groupIds = state.dragGroupIds
      const isMultiDrag = groupIds.length > 1

      // for multi-drag, skip consistency check (secondary items absent from snapshot)
      if (!isMultiDrag && !isSnapshotConsistent(state.dragPreview, state))
      {
        return { dragPreview: null, dragGroupIds: [] }
      }

      // step 1: apply snapshot (positions the primary item)
      let tiers = applyContainerSnapshotToTiers(state.tiers, state.dragPreview)
      let unrankedItemIds = [...state.dragPreview.unrankedItemIds]

      if (isMultiDrag)
      {
        const primaryId = groupIds[0]
        const secondaryIds = groupIds.slice(1)
        const secondarySet = new Set(secondaryIds)

        // step 2: strip secondary items from all containers
        tiers = tiers.map((tier) => ({
          ...tier,
          itemIds: tier.itemIds.filter((id) => !secondarySet.has(id)),
        }))
        unrankedItemIds = unrankedItemIds.filter((id) => !secondarySet.has(id))

        // step 3: find where the primary landed & insert secondaries after it
        let inserted = false
        for (let t = 0; t < tiers.length; t++)
        {
          const pos = tiers[t].itemIds.indexOf(primaryId)
          if (pos !== -1)
          {
            const itemIds = [...tiers[t].itemIds]
            itemIds.splice(pos + 1, 0, ...secondaryIds)
            tiers = tiers.map((tier, idx) =>
              idx === t ? { ...tier, itemIds } : tier
            )
            inserted = true
            break
          }
        }
        if (!inserted)
        {
          const pos = unrankedItemIds.indexOf(primaryId)
          if (pos !== -1)
          {
            unrankedItemIds.splice(pos + 1, 0, ...secondaryIds)
          }
        }
      }

      // clear selection only on multi-drag commit — a single-item drag should
      // leave any unrelated selection intact
      const selectionReset: Partial<TierListStore> = isMultiDrag
        ? { selectedItemIds: [], lastClickedItemId: null }
        : {}

      return {
        ...pushUndo(state),
        tiers,
        unrankedItemIds,
        dragPreview: null,
        dragGroupIds: [],
        ...selectionReset,
        itemsManuallyMoved: true,
      }
    }),

  discardDragPreview: () => set({ dragPreview: null, dragGroupIds: [] }),

  undo: () =>
    set((state) =>
    {
      const prev = state.past[state.past.length - 1]

      if (!prev)
      {
        return state
      }

      return {
        ...prev,
        past: state.past.slice(0, -1),
        future: [extractBoardData(state), ...state.future].slice(0, 50),
        activeItemId: null,
        dragPreview: null,
        dragGroupIds: [],
        keyboardMode: 'idle',
        keyboardFocusItemId: null,
        selectedItemIds: [],
        lastClickedItemId: null,
      }
    }),

  redo: () =>
    set((state) =>
    {
      const next = state.future[0]

      if (!next)
      {
        return state
      }

      return {
        ...next,
        past: [...state.past, extractBoardData(state)].slice(-50),
        future: state.future.slice(1),
        activeItemId: null,
        dragPreview: null,
        dragGroupIds: [],
        keyboardMode: 'idle',
        keyboardFocusItemId: null,
        selectedItemIds: [],
        lastClickedItemId: null,
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

      return withUndo(state, {
        tiers: nextTiers,
      })
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
        ...withUndo(state, {
          tiers: shuffled.tiers,
          unrankedItemIds: shuffled.unrankedItemIds,
        }),
        itemsManuallyMoved: false,
      }
    }),

  shuffleUnrankedItems: () =>
    set((state) =>
    {
      const shuffled = shuffleUnrankedItems(state.tiers, state.unrankedItemIds)

      if (!shuffled)
      {
        return state
      }

      return {
        ...withUndo(state, {
          tiers: shuffled.tiers,
          unrankedItemIds: shuffled.unrankedItemIds,
        }),
        itemsManuallyMoved: false,
      }
    }),

  resetBoard: (paletteId) =>
    set((state) => ({
      ...resetBoardData(state, paletteId),
      ...freshRuntimeState,
    })),

  loadBoard: (data) =>
    set(() => ({
      ...data,
      ...freshRuntimeState,
    })),

  toggleItemSelected: (itemId, shiftKey) =>
    set((state) =>
    {
      if (!shiftKey) return state

      const prev = state.selectedItemIds
      const idx = prev.indexOf(itemId)

      if (state.lastClickedItemId && idx === -1)
      {
        // range selection: add all items between last clicked & current
        const allIds = [
          ...state.tiers.flatMap((t) => t.itemIds),
          ...state.unrankedItemIds,
        ]
        const startIdx = allIds.indexOf(state.lastClickedItemId)
        const endIdx = allIds.indexOf(itemId)

        if (startIdx !== -1 && endIdx !== -1)
        {
          const [from, to] =
            startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx]
          const next = [...prev]
          for (let i = from; i <= to; i++)
          {
            if (!next.includes(allIds[i])) next.push(allIds[i])
          }
          return { selectedItemIds: next, lastClickedItemId: itemId }
        }
      }

      // toggle: deselect if already selected, otherwise append
      if (idx !== -1)
      {
        return {
          selectedItemIds: prev.filter((id) => id !== itemId),
          lastClickedItemId: itemId,
        }
      }

      return {
        selectedItemIds: [...prev, itemId],
        lastClickedItemId: itemId,
      }
    }),

  clearSelection: () => set({ selectedItemIds: [], lastClickedItemId: null }),

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
        selectedItemIds: [],
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
        selectedItemIds: [],
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
        selectedItemIds: [],
        lastClickedItemId: null,
      }
    }),
}))
