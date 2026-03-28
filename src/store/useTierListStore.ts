// src/store/useTierListStore.ts
// * Zustand store — single active board state (persistence handled by board manager)

import { create } from 'zustand'

import {
  DEFAULT_TITLE,
  buildDefaultTiers,
  clampIndex,
} from '../utils/constants'
import {
  getAutoTierColorUpdate,
  hydrateTierColorSources,
  THEME_PALETTE,
} from '../theme'
import { useSettingsStore } from './useSettingsStore'
import {
  applyContainerSnapshotToTiers,
  createContainerSnapshot,
} from '../utils/dragInsertion'
import type {
  ContainerSnapshot,
  KeyboardMode,
  NewTierItem,
  PaletteId,
  Tier,
  TierColorSource,
  TierColorUpdate,
  TierListData,
} from '../types'

// full store shape — extends persisted data w/ runtime-only fields & actions
interface TierListStore extends TierListData
{
  // ID of the item currently being dragged (null when idle)
  activeItemId: string | null
  // runtime-only ordering snapshot shown while a drag is active
  dragPreview: ContainerSnapshot | null
  // current keyboard interaction mode for item navigation & drag
  keyboardMode: KeyboardMode
  // item currently focused by keyboard browse mode
  keyboardFocusItemId: string | null
  // non-fatal error message shown in the UI (null when clear)
  runtimeError: string | null
  // undo/redo history stacks (runtime-only, not persisted)
  past: TierListData[]
  future: TierListData[]
  setActiveItemId: (itemId: string | null) => void
  setKeyboardMode: (mode: KeyboardMode) => void
  setKeyboardFocusItemId: (itemId: string | null) => void
  clearKeyboardMode: () => void
  setRuntimeError: (message: string) => void
  clearRuntimeError: () => void
  updateTitle: (title: string) => void
  addTier: () => void
  renameTier: (tierId: string, name: string) => void
  recolorTier: (
    tierId: string,
    color: string,
    colorSource?: TierColorSource | null
  ) => void
  batchRecolorTiers: (colorMap: Map<string, TierColorUpdate>) => void
  reorderTier: (tierId: string, direction: 'up' | 'down') => void
  deleteTier: (tierId: string) => void
  clearTierItems: (tierId: string) => void
  addTierAt: (index: number) => void
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
  applyPalette: (paletteId: PaletteId) => void
  resetBoard: () => void
  loadBoard: (data: TierListData) => void
}

// build fresh initial board data w/ default tiers (always uses active theme's palette)
export const createInitialData = (): TierListData =>
{
  const { themeId } = useSettingsStore.getState()
  return {
    title: DEFAULT_TITLE,
    tiers: buildDefaultTiers(THEME_PALETTE[themeId]),
    deletedItems: [],
    items: {},
    unrankedItemIds: [],
  }
}

// extract the persisted board data fields from the store
export const extractBoardData = (state: TierListStore): TierListData => ({
  title: state.title,
  tiers: state.tiers,
  unrankedItemIds: state.unrankedItemIds,
  items: state.items,
  deletedItems: state.deletedItems,
})

// build a new tier object for the given tier count (used by addTier & addTierAt)
const createNewTier = (tierCount: number): Tier =>
{
  const { themeId } = useSettingsStore.getState()
  const colorUpdate = getAutoTierColorUpdate(THEME_PALETTE[themeId], tierCount)

  return {
    id: `tier-${crypto.randomUUID()}`,
    name: `Tier ${tierCount + 1}`,
    color: colorUpdate.color,
    colorSource: colorUpdate.colorSource,
    itemIds: [],
  }
}

// runtime-only field defaults — shared by resetBoard & loadBoard
const freshRuntimeState = {
  activeItemId: null as string | null,
  dragPreview: null as ContainerSnapshot | null,
  keyboardMode: 'idle' as KeyboardMode,
  keyboardFocusItemId: null as string | null,
  runtimeError: null as string | null,
  past: [] as TierListData[],
  future: [] as TierListData[],
}

// push current state onto the undo stack & clear the redo stack
const pushUndo = (state: TierListStore) => ({
  past: [...state.past, extractBoardData(state)].slice(-50),
  future: [] as TierListData[],
})

// clear keyboard state when removing an item that is actively focused or dragged
const keyboardCleanupForItem = (state: TierListStore, itemId: string) => ({
  activeItemId: state.activeItemId === itemId ? null : state.activeItemId,
  keyboardFocusItemId:
    state.keyboardFocusItemId === itemId ? null : state.keyboardFocusItemId,
  keyboardMode:
    state.keyboardFocusItemId === itemId || state.activeItemId === itemId
      ? ('idle' as KeyboardMode)
      : state.keyboardMode,
})

// * primary Zustand store — active board state (persistence managed by useBoardManagerStore)
export const useTierListStore = create<TierListStore>()((set) => ({
  ...createInitialData(),
  activeItemId: null,
  dragPreview: null,
  keyboardMode: 'idle',
  keyboardFocusItemId: null,
  runtimeError: null,
  past: [],
  future: [],

  // set the currently dragged item ID
  setActiveItemId: (itemId) => set({ activeItemId: itemId }),

  // update the current keyboard interaction mode
  setKeyboardMode: (mode) => set({ keyboardMode: mode }),

  // track the item currently focused by keyboard navigation
  setKeyboardFocusItemId: (itemId) => set({ keyboardFocusItemId: itemId }),

  // clear keyboard browse/drag state
  clearKeyboardMode: () =>
    set({
      keyboardMode: 'idle',
      keyboardFocusItemId: null,
    }),

  // surface a runtime error message in the UI
  setRuntimeError: (message) => set({ runtimeError: message }),

  // dismiss the current runtime error banner
  clearRuntimeError: () => set({ runtimeError: null }),

  // update the board title
  updateTitle: (title) =>
    set((state) => ({
      ...pushUndo(state),
      title,
    })),

  // append a new tier row at the end w/ the next cycling color
  addTier: () =>
    set((state) => ({
      ...pushUndo(state),
      tiers: [...state.tiers, createNewTier(state.tiers.length)],
    })),

  // rename a tier, ignoring empty strings
  renameTier: (tierId, name) =>
    set((state) => ({
      ...pushUndo(state),
      tiers: state.tiers.map((tier) =>
        tier.id === tierId ? { ...tier, name: name.trim() || tier.name } : tier
      ),
    })),

  // update the background color of a tier label
  recolorTier: (tierId, color, colorSource = null) =>
    set((state) => ({
      ...pushUndo(state),
      tiers: state.tiers.map((tier) =>
        tier.id === tierId ? { ...tier, color, colorSource } : tier
      ),
    })),

  // recolor multiple tiers in a single update (one undo entry)
  batchRecolorTiers: (colorMap) =>
    set((state) =>
    {
      if (colorMap.size === 0) return state
      return {
        ...pushUndo(state),
        tiers: state.tiers.map((tier) =>
        {
          const colorUpdate = colorMap.get(tier.id)
          return colorUpdate
            ? {
                ...tier,
                color: colorUpdate.color,
                colorSource: colorUpdate.colorSource,
              }
            : tier
        }),
      }
    }),

  // swap a tier w/ its neighbor in the given direction
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

      // splice out & reinsert the tier at the target position
      const nextTiers = [...state.tiers]
      const [moved] = nextTiers.splice(tierIndex, 1)
      nextTiers.splice(targetIndex, 0, moved)

      return { ...pushUndo(state), tiers: nextTiers }
    }),

  // remove a tier & move its items back to the unranked pool
  deleteTier: (tierId) =>
    set((state) =>
    {
      // enforce minimum of one tier on the board
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
        ...pushUndo(state),
        tiers: state.tiers.filter((entry) => entry.id !== tierId),
        // prepend displaced items to the front of the unranked pool
        unrankedItemIds: [...tier.itemIds, ...state.unrankedItemIds],
      }
    }),

  // move all items from a tier back to the unranked pool
  clearTierItems: (tierId) =>
    set((state) =>
    {
      const tier = state.tiers.find((t) => t.id === tierId)
      if (!tier || tier.itemIds.length === 0)
      {
        return state
      }
      return {
        ...pushUndo(state),
        tiers: state.tiers.map((t) =>
          t.id === tierId ? { ...t, itemIds: [] } : t
        ),
        // prepend cleared items to the unranked pool
        unrankedItemIds: [...tier.itemIds, ...state.unrankedItemIds],
      }
    }),

  // insert a new tier at a specific index (clamped to valid range)
  addTierAt: (index) =>
    set((state) =>
    {
      const clampedIndex = clampIndex(index, 0, state.tiers.length)
      const nextTiers = [...state.tiers]
      nextTiers.splice(clampedIndex, 0, createNewTier(state.tiers.length))
      return { ...pushUndo(state), tiers: nextTiers }
    }),

  // append newly uploaded items to the items map & unranked pool
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
        ...pushUndo(state),
        items: nextItems,
        unrankedItemIds: nextUnranked,
      }
    }),

  // add a single text-only item w/ a label & background color
  addTextItem: (label, backgroundColor) =>
    set((state) =>
    {
      const id = crypto.randomUUID()
      return {
        ...pushUndo(state),
        items: {
          ...state.items,
          [id]: { id, label, backgroundColor },
        },
        unrankedItemIds: [...state.unrankedItemIds, id],
      }
    }),

  // remove an item from the board & move it to the deleted list
  removeItem: (itemId) =>
    set((state) =>
    {
      const undo = pushUndo(state)
      const deletedItem = state.items[itemId]
      const nextItems = { ...state.items }
      delete nextItems[itemId]
      // prepend to deleted list (newest first), cap at 50
      const nextDeleted = deletedItem
        ? [deletedItem, ...state.deletedItems].slice(0, 50)
        : state.deletedItems

      const kbCleanup = keyboardCleanupForItem(state, itemId)

      // check unranked pool first
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

      // find & update only the tier that contains this item
      const ownerTier = state.tiers.find((tier) =>
        tier.itemIds.includes(itemId)
      )
      if (!ownerTier)
      {
        return { ...undo, items: nextItems, deletedItems: nextDeleted }
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

  // restore a deleted item back to the unranked pool
  restoreDeletedItem: (itemId) =>
    set((state) =>
    {
      const item = state.deletedItems.find((i) => i.id === itemId)
      if (!item)
      {
        return state
      }
      return {
        ...pushUndo(state),
        items: { ...state.items, [item.id]: item },
        unrankedItemIds: [...state.unrankedItemIds, item.id],
        deletedItems: state.deletedItems.filter((i) => i.id !== itemId),
      }
    }),

  // permanently remove a single item from the deleted list
  permanentlyDeleteItem: (itemId) =>
    set((state) => ({
      ...pushUndo(state),
      deletedItems: state.deletedItems.filter((i) => i.id !== itemId),
    })),

  // permanently clear all deleted items
  clearDeletedItems: () =>
    set((state) => ({
      ...pushUndo(state),
      deletedItems: [],
    })),

  // remove every item from tiers & unranked pool, moving them to the deleted list
  clearAllItems: () =>
    set((state) =>
    {
      // collect all item IDs from every tier & the unranked pool
      const allItemIds = [
        ...state.tiers.flatMap((t) => t.itemIds),
        ...state.unrankedItemIds,
      ]
      if (allItemIds.length === 0) return state

      // prepend cleared items to deleted list (newest first, cap at 50)
      const clearedItems = allItemIds
        .map((id) => state.items[id])
        .filter(Boolean)
      const nextDeleted = [...clearedItems, ...state.deletedItems].slice(0, 50)

      // remove cleared items from the items map
      const nextItems = { ...state.items }
      for (const id of allItemIds)
      {
        delete nextItems[id]
      }

      return {
        ...pushUndo(state),
        items: nextItems,
        deletedItems: nextDeleted,
        tiers: state.tiers.map((t) => ({ ...t, itemIds: [] })),
        unrankedItemIds: [],
      }
    }),

  // capture the current board ordering so drag hover can work against a transient preview
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

  // store the exact transient drag-preview snapshot computed by the drag hook
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

  // persist the exact preview snapshot that was shown on hover
  commitDragPreview: () =>
    set((state) =>
    {
      if (!state.dragPreview)
      {
        return state
      }

      return {
        ...pushUndo(state),
        tiers: applyContainerSnapshotToTiers(state.tiers, state.dragPreview),
        unrankedItemIds: [...state.dragPreview.unrankedItemIds],
        dragPreview: null,
      }
    }),

  // clear the transient preview without touching persisted board order
  discardDragPreview: () => set({ dragPreview: null }),

  // restore the previous board state from the undo stack
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

  // re-apply the next board state from the redo stack
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

  // apply a palette's colors to existing tiers by position (wraps for 7+ tiers)
  applyPalette: (paletteId) =>
    set((state) =>
    {
      return {
        ...pushUndo(state),
        tiers: state.tiers.map((tier, i) => ({
          ...tier,
          ...getAutoTierColorUpdate(paletteId, i),
        })),
      }
    }),

  // move all items back to unranked pool & restore default tiers (keeps images)
  resetBoard: () =>
    set((state) =>
    {
      const { themeId } = useSettingsStore.getState()
      const allItemIds = [
        ...state.tiers.flatMap((t) => t.itemIds),
        ...state.unrankedItemIds,
      ]
      return {
        title: DEFAULT_TITLE,
        tiers: buildDefaultTiers(THEME_PALETTE[themeId]),
        unrankedItemIds: allItemIds,
        items: state.items,
        deletedItems: state.deletedItems,
        ...freshRuntimeState,
      }
    }),

  // replace entire board state w/ new data (used by board manager on switch/create)
  loadBoard: (data) =>
    set(() =>
    {
      const { themeId } = useSettingsStore.getState()

      return {
        ...data,
        tiers: hydrateTierColorSources(THEME_PALETTE[themeId], data.tiers),
        ...freshRuntimeState,
      }
    }),
}))
