// src/utils/storage.ts
// centralized localStorage access — keys, migrations, persist adapters, & board I/O

import {
  createJSONStorage,
  type PersistStorage,
  type StateStorage,
} from 'zustand/middleware'

import type { Tier, TierListData } from '../types'

// legacy localStorage keys — used only for migration detection
export const APP_STORAGE_KEY = 'tier-list-builder-state'
const LEGACY_APP_STORAGE_KEY = 'tier-list-maker-state'
const LEGACY_BOARD_REGISTRY_KEY = 'tier-list-maker-boards'
const LEGACY_SETTINGS_KEY = 'tier-list-maker-settings'
// localStorage key for the multi-board registry
export const BOARD_REGISTRY_KEY = 'tier-list-builder-boards'
// localStorage key for global user settings
export const SETTINGS_STORAGE_KEY = 'tier-list-builder-settings'
// build a per-board localStorage key from its ID
export const boardStorageKey = (id: string): string => `tier-list-board-${id}`

// resolve the browser storage object once so every caller goes through this file
const getStorage = (): Storage | null =>
{
  if (typeof localStorage === 'undefined')
  {
    return null
  }

  return localStorage
}

// read a raw localStorage value, swallowing browser/storage access errors
const readStorageItem = (key: string): string | null =>
{
  try
  {
    return getStorage()?.getItem(key) ?? null
  }
  catch
  {
    return null
  }
}

// write a raw localStorage value, swallowing browser/storage access errors
const writeStorageItem = (key: string, value: string): void =>
{
  try
  {
    getStorage()?.setItem(key, value)
  }
  catch
  {
    // no-op
  }
}

// remove a raw localStorage value, swallowing browser/storage access errors
const deleteStorageItem = (key: string): void =>
{
  try
  {
    getStorage()?.removeItem(key)
  }
  catch
  {
    // no-op
  }
}

// shared Zustand state-storage adapter so persist middleware never touches
// localStorage directly outside this module
export const appStateStorage: StateStorage = {
  getItem: (key) => readStorageItem(key),
  setItem: (key, value) => writeStorageItem(key, value),
  removeItem: (key) => deleteStorageItem(key),
}

// build the shared JSON persist storage used by all Zustand persisted stores
export const createAppPersistStorage = <S>(): PersistStorage<S> =>
  createJSONStorage<S>(() => appStateStorage)!

// migrate legacy "maker" localStorage keys to "builder" equivalents
export const migrateStorageKeys = (): void =>
{
  for (const [oldKey, newKey] of [
    [LEGACY_APP_STORAGE_KEY, APP_STORAGE_KEY],
    [LEGACY_BOARD_REGISTRY_KEY, BOARD_REGISTRY_KEY],
    [LEGACY_SETTINGS_KEY, SETTINGS_STORAGE_KEY],
  ] as const)
  {
    const oldValue = readStorageItem(oldKey)
    if (oldValue && !readStorageItem(newKey))
    {
      writeStorageItem(newKey, oldValue)
      deleteStorageItem(oldKey)
    }
  }
}

// save board data to its per-board localStorage key
export const saveBoardToStorage = (
  boardId: string,
  data: TierListData,
  onError?: (message: string) => void
): void =>
{
  try
  {
    getStorage()?.setItem(boardStorageKey(boardId), JSON.stringify(data))
  }
  catch
  {
    onError?.(
      'Could not save changes to localStorage. Free up browser storage and try again.'
    )
  }
}

// load board data from its per-board localStorage key
export const loadBoardFromStorage = (boardId: string): TierListData | null =>
{
  try
  {
    const raw = readStorageItem(boardStorageKey(boardId))
    return raw ? (JSON.parse(raw) as TierListData) : null
  }
  catch
  {
    return null
  }
}

// remove a board's per-board localStorage key
export const removeBoardFromStorage = (boardId: string): void =>
{
  deleteStorageItem(boardStorageKey(boardId))
}

// estimate total localStorage usage in bytes (UTF-16 = 2 bytes per char)
export const getStorageUsageBytes = (): number =>
{
  const storage = getStorage()
  if (!storage)
  {
    return 0
  }

  let chars = 0
  for (let i = 0; i < storage.length; i++)
  {
    const key = storage.key(i)
    if (!key)
    {
      continue
    }

    chars += key.length + (readStorageItem(key)?.length ?? 0)
  }
  return chars * 2
}

// v1 tier IDs/colors used before the S–F → S–E rename in schema v2
const LEGACY_DEFAULT_TIER_SIGNATURE: Record<
  string,
  { name: string; color: string }
> = {
  'tier-s': { name: 'S', color: '#ff7f7f' },
  'tier-a': { name: 'A', color: '#ffbf7f' },
  'tier-b': { name: 'B', color: '#ffdf7f' },
  'tier-c': { name: 'C', color: '#ffff7f' },
  'tier-d': { name: 'D', color: '#7fff7f' },
  'tier-f': { name: 'F', color: '#7fbfff' },
}

// check if the persisted tiers exactly match the v1 default signature
const isLegacyDefaultTierSet = (tiers: Tier[]): boolean =>
{
  const legacyIds = Object.keys(LEGACY_DEFAULT_TIER_SIGNATURE)
  if (tiers.length !== legacyIds.length) return false
  if (tiers.some((tier) => tier.id === 'tier-e')) return false

  for (const tierId of legacyIds)
  {
    const expected = LEGACY_DEFAULT_TIER_SIGNATURE[tierId]
    const actual = tiers.find((tier) => tier.id === tierId)
    if (!actual) return false
    if (actual.name !== expected.name) return false
    if (actual.color.toLowerCase() !== expected.color) return false
  }
  return true
}

// rename tier-f → tier-e & update its label/color to the v2 defaults
const migrateLegacyDefaultTierSet = (tiers: Tier[]): Tier[] =>
{
  if (!isLegacyDefaultTierSet(tiers)) return tiers
  return tiers.map((tier) =>
    tier.id === 'tier-f'
      ? { ...tier, id: 'tier-e', name: 'E', color: '#74e56d' }
      : tier
  )
}

// attempt to migrate the legacy single-board localStorage key into the multi-board system
export const migrateLegacyBoard = (
  defaultTitle: string
): { id: string; data: TierListData } | null =>
{
  try
  {
    const raw = readStorageItem(APP_STORAGE_KEY)
    if (!raw) return null

    const envelope = JSON.parse(raw) as {
      state?: Partial<TierListData>
      version?: number
    }
    const state = envelope?.state
    if (!state || !Array.isArray(state.tiers)) return null

    // run v1 → v2 tier migration if needed
    const version = envelope.version ?? 1
    const tiers =
      version < 2
        ? migrateLegacyDefaultTierSet(state.tiers as Tier[])
        : (state.tiers as Tier[])

    const data: TierListData = {
      title: state.title ?? defaultTitle,
      tiers,
      unrankedItemIds: state.unrankedItemIds ?? [],
      items: state.items ?? {},
      deletedItems: state.deletedItems ?? [],
    }

    const id = `board-${crypto.randomUUID()}`
    saveBoardToStorage(id, data)

    // clean up legacy key
    deleteStorageItem(APP_STORAGE_KEY)

    return { id, data }
  }
  catch
  {
    return null
  }
}
