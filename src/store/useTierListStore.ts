// src/store/useTierListStore.ts
// * Zustand store — persisted tier list state w/ localStorage & migration
import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

import {
  APP_STORAGE_KEY,
  DEFAULT_TITLE,
  PRESET_TIER_COLORS,
  buildDefaultTiers,
  clampIndex,
} from '../utils/constants'
import {
  applyContainerSnapshotToTiers,
  createContainerSnapshot,
} from '../utils/dragInsertion'
import type { ContainerSnapshot, NewTierItem, Tier, TierListData } from '../types'
import { buildSampleItemsState } from '../utils/sampleItems'

// full store shape — extends persisted data w/ runtime-only fields & actions
interface TierListStore extends TierListData {
  // ID of the item currently being dragged (null when idle)
  activeItemId: string | null
  // runtime-only ordering snapshot shown while a drag is active
  dragPreview: ContainerSnapshot | null
  // non-fatal error message shown in the UI (null when clear)
  runtimeError: string | null
  setActiveItemId: (itemId: string | null) => void
  setRuntimeError: (message: string) => void
  clearRuntimeError: () => void
  updateTitle: (title: string) => void
  addTier: () => void
  renameTier: (tierId: string, name: string) => void
  recolorTier: (tierId: string, color: string) => void
  reorderTier: (tierId: string, direction: 'up' | 'down') => void
  deleteTier: (tierId: string) => void
  clearTierItems: (tierId: string) => void
  addTierAt: (index: number) => void
  addItems: (newItems: NewTierItem[]) => void
  removeItem: (itemId: string) => void
  beginDragPreview: () => void
  updateDragPreview: (
    preview: ContainerSnapshot,
  ) => void
  commitDragPreview: () => void
  discardDragPreview: () => void
  resetBoard: () => void
}

// build fresh initial board data w/ default tiers & sample items
const createInitialData = (): TierListData => ({
  title: DEFAULT_TITLE,
  tiers: buildDefaultTiers(),
  ...buildSampleItemsState(),
})

// v1 tier IDs/colors used before the S–F → S–E rename in schema v2
const LEGACY_DEFAULT_TIER_SIGNATURE: Record<string, { name: string; color: string }> = {
  'tier-s': { name: 'S', color: '#ff7f7f' },
  'tier-a': { name: 'A', color: '#ffbf7f' },
  'tier-b': { name: 'B', color: '#ffdf7f' },
  'tier-c': { name: 'C', color: '#ffff7f' },
  'tier-d': { name: 'D', color: '#7fff7f' },
  'tier-f': { name: 'F', color: '#7fbfff' },
}

// check if the persisted tiers exactly match the v1 default signature
const isLegacyDefaultTierSet = (tiers: Tier[]): boolean => {
  const legacyIds = Object.keys(LEGACY_DEFAULT_TIER_SIGNATURE)
  if (tiers.length !== legacyIds.length) {
    return false
  }

  // already migrated if tier-e exists
  if (tiers.some((tier) => tier.id === 'tier-e')) {
    return false
  }

  for (const tierId of legacyIds) {
    const expected = LEGACY_DEFAULT_TIER_SIGNATURE[tierId]
    const actual = tiers.find((tier) => tier.id === tierId)

    if (!actual) {
      return false
    }

    if (actual.name !== expected.name) {
      return false
    }

    if (actual.color.toLowerCase() !== expected.color) {
      return false
    }
  }

  return true
}

// rename tier-f → tier-e & update its label/color to the v2 defaults
const migrateLegacyDefaultTierSet = (tiers: Tier[]): Tier[] => {
  if (!isLegacyDefaultTierSet(tiers)) {
    return tiers
  }

  return tiers.map((tier) =>
    tier.id === 'tier-f'
      ? { ...tier, id: 'tier-e', name: 'E', color: '#74e56d' }
      : tier,
  )
}

// module-level ref so safeStorage can forward errors into the store
let reportPersistError: ((message: string) => void) | null = null

// localStorage wrapper that suppresses exceptions & surfaces errors via the store
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value)
    } catch {
      reportPersistError?.(
        'Could not save changes to localStorage. Free up browser storage and try again.',
      )
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name)
    } catch {
      // no-op
    }
  },
}

// cycle through preset colors by tier index
const getTierLabelColor = (index: number): string => {
  return PRESET_TIER_COLORS[index % PRESET_TIER_COLORS.length]
}

// build a new tier object for the given tier count (used by addTier & addTierAt)
const createNewTier = (tierCount: number): Tier => ({
  id: `tier-${crypto.randomUUID()}`,
  name: `Tier ${tierCount + 1}`,
  color: getTierLabelColor(tierCount),
  itemIds: [],
})

// return true when the board has no items at all (triggers sample backfill)
const shouldBackfillSampleItems = (
  state: Pick<TierListData, 'tiers' | 'items' | 'unrankedItemIds'>,
) =>
  Object.keys(state.items).length === 0 &&
  state.unrankedItemIds.length === 0 &&
  state.tiers.every((tier) => tier.itemIds.length === 0)

// * primary Zustand store — persisted to localStorage w/ versioned migration
export const useTierListStore = create<TierListStore>()(
  persist(
    (set) => {
      // wire up the storage error reporter once the store is created
      reportPersistError = (message) => set({ runtimeError: message })

      return {
        ...createInitialData(),
        activeItemId: null,
        dragPreview: null,
        runtimeError: null,

        // set the currently dragged item ID
        setActiveItemId: (itemId) => set({ activeItemId: itemId }),

        // surface a runtime error message in the UI
        setRuntimeError: (message) => set({ runtimeError: message }),

        // dismiss the current runtime error banner
        clearRuntimeError: () => set({ runtimeError: null }),

        // update the board title
        updateTitle: (title) => set({ title }),

        // append a new tier row at the end w/ the next cycling color
        addTier: () =>
          set((state) => ({
            tiers: [...state.tiers, createNewTier(state.tiers.length)],
          })),

        // rename a tier, ignoring empty strings
        renameTier: (tierId, name) =>
          set((state) => ({
            tiers: state.tiers.map((tier) =>
              tier.id === tierId ? { ...tier, name: name.trim() || tier.name } : tier,
            ),
          })),

        // update the background color of a tier label
        recolorTier: (tierId, color) =>
          set((state) => ({
            tiers: state.tiers.map((tier) =>
              tier.id === tierId ? { ...tier, color } : tier,
            ),
          })),

        // swap a tier w/ its neighbor in the given direction
        reorderTier: (tierId, direction) =>
          set((state) => {
            const tierIndex = state.tiers.findIndex((tier) => tier.id === tierId)
            if (tierIndex < 0) {
              return state
            }

            const targetIndex = direction === 'up' ? tierIndex - 1 : tierIndex + 1
            if (targetIndex < 0 || targetIndex >= state.tiers.length) {
              return state
            }

            // splice out & reinsert the tier at the target position
            const nextTiers = [...state.tiers]
            const [moved] = nextTiers.splice(tierIndex, 1)
            nextTiers.splice(targetIndex, 0, moved)

            return { tiers: nextTiers }
          }),

        // remove a tier & move its items back to the unranked pool
        deleteTier: (tierId) =>
          set((state) => {
            // enforce minimum of one tier on the board
            if (state.tiers.length <= 1) {
              return {
                runtimeError: 'At least one tier must remain.',
              }
            }

            const tier = state.tiers.find((entry) => entry.id === tierId)
            if (!tier) {
              return state
            }

            return {
              tiers: state.tiers.filter((entry) => entry.id !== tierId),
              // prepend displaced items to the front of the unranked pool
              unrankedItemIds: [...state.unrankedItemIds, ...tier.itemIds],
            }
          }),

        // move all items from a tier back to the unranked pool
        clearTierItems: (tierId) =>
          set((state) => {
            const tier = state.tiers.find((t) => t.id === tierId)
            if (!tier || tier.itemIds.length === 0) {
              return state
            }
            return {
              tiers: state.tiers.map((t) =>
                t.id === tierId ? { ...t, itemIds: [] } : t,
              ),
              // prepend cleared items to the unranked pool
              unrankedItemIds: [...tier.itemIds, ...state.unrankedItemIds],
            }
          }),

        // insert a new tier at a specific index (clamped to valid range)
        addTierAt: (index) =>
          set((state) => {
            const clampedIndex = clampIndex(index, 0, state.tiers.length)
            const nextTiers = [...state.tiers]
            nextTiers.splice(clampedIndex, 0, createNewTier(state.tiers.length))
            return { tiers: nextTiers }
          }),

        // append newly uploaded items to the items map & unranked pool
        addItems: (newItems) =>
          set((state) => {
            const nextItems = { ...state.items }
            const nextUnranked = [...state.unrankedItemIds]

            for (const newItem of newItems) {
              const id = crypto.randomUUID()
              nextItems[id] = {
                id,
                imageUrl: newItem.imageUrl,
                label: newItem.label,
              }
              nextUnranked.push(id)
            }

            return {
              items: nextItems,
              unrankedItemIds: nextUnranked,
            }
          }),

        // delete an item from the map & remove it from its container
        removeItem: (itemId) =>
          set((state) => {
            const nextItems = { ...state.items }
            delete nextItems[itemId]

            // check unranked pool first
            if (state.unrankedItemIds.includes(itemId)) {
              return {
                items: nextItems,
                unrankedItemIds: state.unrankedItemIds.filter((id) => id !== itemId),
              }
            }

            // find & update only the tier that contains this item
            const ownerTier = state.tiers.find((tier) => tier.itemIds.includes(itemId))
            if (!ownerTier) {
              return { items: nextItems }
            }

            return {
              items: nextItems,
              tiers: state.tiers.map((tier) =>
                tier.id === ownerTier.id
                  ? { ...tier, itemIds: tier.itemIds.filter((id) => id !== itemId) }
                  : tier,
              ),
            }
          }),

        // capture the current board ordering so drag hover can work against a transient preview
        beginDragPreview: () =>
          set((state) => {
            if (state.dragPreview) {
              return state
            }

            return {
              dragPreview: createContainerSnapshot(state),
            }
          }),

        // store the exact transient drag-preview snapshot computed by the drag hook
        updateDragPreview: (preview) =>
          set((state) => {
            if (state.dragPreview === preview) {
              return state
            }

            return {
              dragPreview: preview,
            }
          }),

        // persist the exact preview snapshot that was shown on hover
        commitDragPreview: () =>
          set((state) => {
            if (!state.dragPreview) {
              return state
            }

            return {
              tiers: applyContainerSnapshotToTiers(state.tiers, state.dragPreview),
              unrankedItemIds: [...state.dragPreview.unrankedItemIds],
              dragPreview: null,
            }
          }),

        // clear the transient preview without touching persisted board order
        discardDragPreview: () => set({ dragPreview: null }),

        // restore board to defaults & reload sample items
        resetBoard: () =>
          set(() => ({
            ...createInitialData(),
            activeItemId: null,
            dragPreview: null,
            runtimeError: null,
          })),
      }
    },
    {
      name: APP_STORAGE_KEY,
      version: 2,
      storage: createJSONStorage(() => safeStorage),
      // migrate persisted state from earlier schema versions
      migrate: (persistedState, version) => {
        if (version >= 2 || !persistedState || typeof persistedState !== 'object') {
          return persistedState
        }

        const typedPersistedState = persistedState as Partial<TierListData>
        if (!Array.isArray(typedPersistedState.tiers)) {
          return persistedState
        }

        // apply v1 → v2 tier rename migration
        return {
          ...typedPersistedState,
          tiers: migrateLegacyDefaultTierSet(typedPersistedState.tiers as Tier[]),
        }
      },
      // only persist the board data — exclude runtime state
      partialize: (state) => ({
        title: state.title,
        tiers: state.tiers,
        unrankedItemIds: state.unrankedItemIds,
        items: state.items,
      }),
      // merge persisted data over the default initial state
      merge: (persistedState, currentState) => {
        const typedPersistedState = persistedState as Partial<TierListData> | undefined

        const mergedState = {
          ...currentState,
          title: typedPersistedState?.title ?? currentState.title,
          tiers: typedPersistedState?.tiers ?? currentState.tiers,
          unrankedItemIds:
            typedPersistedState?.unrankedItemIds ?? currentState.unrankedItemIds,
          items: typedPersistedState?.items ?? currentState.items,
        }

        // backfill sample items when the board is completely empty
        if (!shouldBackfillSampleItems(mergedState)) {
          return mergedState
        }

        return {
          ...mergedState,
          ...buildSampleItemsState(),
        }
      },
    },
  ),
)
