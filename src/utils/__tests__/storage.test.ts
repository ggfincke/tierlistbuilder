// src/utils/__tests__/storage.test.ts
// unit tests for shared storage access, board persistence, & legacy migration

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TierListData } from '../../types'
import {
  APP_STORAGE_KEY,
  BOARD_REGISTRY_KEY,
  SETTINGS_STORAGE_KEY,
  boardStorageKey,
  createAppPersistStorage,
  getStorageUsageBytes,
  loadBoardFromStorage,
  migrateLegacyBoard,
  migrateStorageKeys,
  saveBoardToStorage,
} from '../storage'

class MemoryStorage implements Storage
{
  private entries = new Map<string, string>()

  get length(): number
  {
    return this.entries.size
  }

  clear(): void
  {
    this.entries.clear()
  }

  getItem(key: string): string | null
  {
    return this.entries.get(key) ?? null
  }

  key(index: number): string | null
  {
    return Array.from(this.entries.keys())[index] ?? null
  }

  removeItem(key: string): void
  {
    this.entries.delete(key)
  }

  setItem(key: string, value: string): void
  {
    this.entries.set(key, value)
  }
}

class ThrowingStorage extends MemoryStorage
{
  override setItem(): void
  {
    throw new Error('quota exceeded')
  }
}

const sampleBoard: TierListData = {
  title: 'Saved Board',
  tiers: [
    {
      id: 'tier-s',
      name: 'S',
      color: '#ff0000',
      colorSource: { paletteType: 'default', index: 0 },
      itemIds: ['item-1'],
    },
  ],
  unrankedItemIds: [],
  items: {
    'item-1': { id: 'item-1', label: 'Alpha' },
  },
  deletedItems: [],
}

describe('storage utilities', () =>
{
  beforeEach(() =>
  {
    vi.stubGlobal('localStorage', new MemoryStorage())
  })

  afterEach(() =>
  {
    vi.unstubAllGlobals()
  })

  it('serializes persisted Zustand state through the shared adapter', async () =>
  {
    const persistStorage = createAppPersistStorage<{ themeId: string }>()
    const payload = {
      state: { themeId: 'midnight' },
      version: 4,
    }

    persistStorage.setItem(SETTINGS_STORAGE_KEY, payload)

    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBe(
      JSON.stringify(payload)
    )
    expect(await persistStorage.getItem(SETTINGS_STORAGE_KEY)).toEqual(payload)

    persistStorage.removeItem(SETTINGS_STORAGE_KEY)
    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull()
  })

  it('loads saved board data & returns null for malformed storage payloads', () =>
  {
    saveBoardToStorage('board-1', sampleBoard)
    expect(loadBoardFromStorage('board-1')).toEqual(sampleBoard)

    localStorage.setItem(boardStorageKey('board-2'), '{')
    expect(loadBoardFromStorage('board-2')).toBeNull()
  })

  it('surfaces quota-style save failures through the onError callback', async () =>
  {
    vi.stubGlobal('localStorage', new ThrowingStorage())

    const onError = vi.fn()
    saveBoardToStorage('board-1', sampleBoard, onError)

    expect(onError).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith(
      'Could not save changes to localStorage. Free up browser storage and try again.'
    )
  })

  it('migrates legacy maker keys to the builder key names', () =>
  {
    localStorage.setItem('tier-list-maker-boards', '{"state":{"boards":[]}}')
    localStorage.setItem(
      'tier-list-maker-settings',
      '{"state":{"themeId":"classic"}}'
    )

    migrateStorageKeys()

    expect(localStorage.getItem(BOARD_REGISTRY_KEY)).toBe(
      '{"state":{"boards":[]}}'
    )
    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBe(
      '{"state":{"themeId":"classic"}}'
    )
    expect(localStorage.getItem('tier-list-maker-boards')).toBeNull()
    expect(localStorage.getItem('tier-list-maker-settings')).toBeNull()
  })

  it('migrates legacy single-board data into a new per-board record', () =>
  {
    localStorage.setItem(
      APP_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: {
          title: 'Legacy Board',
          tiers: [
            { id: 'tier-s', name: 'S', color: '#ff7f7f', itemIds: [] },
            { id: 'tier-a', name: 'A', color: '#ffbf7f', itemIds: [] },
            { id: 'tier-b', name: 'B', color: '#ffdf7f', itemIds: [] },
            { id: 'tier-c', name: 'C', color: '#ffff7f', itemIds: [] },
            { id: 'tier-d', name: 'D', color: '#7fff7f', itemIds: [] },
            { id: 'tier-f', name: 'F', color: '#7fbfff', itemIds: [] },
          ],
          unrankedItemIds: [],
          items: {},
        },
      })
    )

    const migrated = migrateLegacyBoard('Fallback Title')

    expect(migrated?.data.title).toBe('Legacy Board')
    expect(migrated?.data.tiers.at(-1)).toEqual({
      id: 'tier-e',
      name: 'E',
      color: '#74e56d',
      itemIds: [],
    })
    expect(migrated?.id.startsWith('board-')).toBe(true)
    expect(localStorage.getItem(APP_STORAGE_KEY)).toBeNull()
    expect(loadBoardFromStorage(migrated!.id)).toEqual({
      title: 'Legacy Board',
      tiers: migrated!.data.tiers,
      unrankedItemIds: [],
      items: {},
      deletedItems: [],
    })
  })

  it('estimates total storage usage from keys & serialized values', () =>
  {
    localStorage.setItem('alpha', '1234')
    localStorage.setItem('beta', 'zz')

    expect(getStorageUsageBytes()).toBe(
      ('alpha'.length + '1234'.length + 'beta'.length + 'zz'.length) * 2
    )
  })
})
