// src/store/useTierListStore.ts
// * active board store — board data plus transient drag, keyboard, undo, & error state

import { create } from 'zustand'

import type {
  ContainerSnapshot,
  KeyboardMode,
  NewTierItem,
  PaletteId,
  Tier,
  TierColorSpec,
  TierListData,
} from '../types'
import { clampIndex } from '../utils/constants'
import {
  applyContainerSnapshotToTiers,
  createContainerSnapshot,
  isSnapshotConsistent,
} from '../utils/dragSnapshot'
import { createInitialBoardData, extractBoardData } from '../domain/boardData'
import {
  freshRuntimeState,
  type TierListStoreRuntimeState,
} from '../domain/tierListRuntime'
import { getAutoTierColorSpec } from '../domain/tierColors'

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
  recolorTier: (tierId: string, colorSpec: TierColorSpec) => void
  reorderTier: (tierId: string, direction: 'up' | 'down') => void
  deleteTier: (tierId: string) => void
  clearTierItems: (tierId: string) => void
  addTierAt: (index: number, paletteId: PaletteId) => void
  addItems: (newItems: NewTierItem[]) => void
  addTextItem: (label: string, backgroundColor: string) => void
  removeItem: (itemId: string) => void
  restoreDeletedItem: (itemId: string) => void
  permanentlyDeleteItem: (itemId: string) => void
  clearDeletedItems: () => void
  clearAllItems: () => void
  beginDragPreview: () => void
  updateDragPreview: (preview: ContainerSnapshot) => void
  commitDragPreview: () => void
  discardDragPreview: () => void
  undo: () => void
  redo: () => void
  resetBoard: (paletteId: PaletteId) => void
  loadBoard: (data: TierListData) => void
}

const createNewTier = (paletteId: PaletteId, tierCount: number): Tier => ({
  id: `tier-${crypto.randomUUID()}`,
  name: `Tier ${tierCount + 1}`,
  colorSpec: getAutoTierColorSpec(paletteId, tierCount),
  itemIds: [],
})

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

const resetBoardData = (
  state: TierListStore,
  paletteId: PaletteId
): TierListData =>
{
  const allItemIds = [
    ...state.tiers.flatMap((tier) => tier.itemIds),
    ...state.unrankedItemIds,
  ]

  return {
    title: state.title,
    tiers: createInitialBoardData(paletteId).tiers,
    unrankedItemIds: allItemIds,
    items: state.items,
    deletedItems: state.deletedItems,
  }
}

export { extractBoardData }

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
    set((state) =>
      withUndo(state, {
        tiers: [...state.tiers, createNewTier(paletteId, state.tiers.length)],
      })
    ),

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

      if (targetIndex < 0 || targetIndex >= state.tiers.length)
      {
        return state
      }

      const nextTiers = [...state.tiers]
      const [moved] = nextTiers.splice(tierIndex, 1)
      nextTiers.splice(targetIndex, 0, moved)

      return {
        ...pushUndo(state),
        tiers: nextTiers,
      }
    }),

  deleteTier: (tierId) =>
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
    }),

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
    set((state) =>
    {
      const nextItems = { ...state.items }
      const nextUnranked = [...state.unrankedItemIds]

      for (const newItem of newItems)
      {
        const id = crypto.randomUUID()
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
    }),

  addTextItem: (label, backgroundColor) =>
    set((state) =>
    {
      const id = crypto.randomUUID()

      return {
        ...withUndo(state, {}),
        items: {
          ...state.items,
          [id]: { id, label, backgroundColor },
        },
        unrankedItemIds: [...state.unrankedItemIds, id],
      }
    }),

  removeItem: (itemId) =>
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
    }),

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

  beginDragPreview: () =>
    set((state) =>
    {
      if (state.dragPreview)
      {
        return state
      }

      return {
        dragPreview: createContainerSnapshot(state),
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
      if (!state.dragPreview)
      {
        return state
      }

      if (!isSnapshotConsistent(state.dragPreview, state))
      {
        return { dragPreview: null }
      }

      return {
        ...pushUndo(state),
        tiers: applyContainerSnapshotToTiers(state.tiers, state.dragPreview),
        unrankedItemIds: [...state.dragPreview.unrankedItemIds],
        dragPreview: null,
      }
    }),

  discardDragPreview: () => set({ dragPreview: null }),

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
        keyboardMode: 'idle',
        keyboardFocusItemId: null,
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
        keyboardMode: 'idle',
        keyboardFocusItemId: null,
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
}))
