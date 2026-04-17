import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { createInitialBoardData } from '~/features/workspace/boards/model/boardSnapshot'
import {
  boardStorageKey,
  boardSyncStorageKey,
  loadBoardFromStorage,
  saveBoardSyncToStorage,
  saveBoardToStorage,
} from '~/features/workspace/boards/data/local/boardStorage'
import { EMPTY_BOARD_SYNC_STATE } from '~/features/workspace/boards/model/sync'

const TEST_BOARD_ID = 'board-storage-test' as BoardId

const createMemoryStorage = (): Storage =>
{
  const values = new Map<string, string>()

  return {
    get length()
    {
      return values.size
    },
    clear: () =>
    {
      values.clear()
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) =>
    {
      values.delete(key)
    },
    setItem: (key, value) =>
    {
      values.set(key, value)
    },
  } as Storage
}

const createFailingStorage = (blockedKeys: Set<string>): Storage =>
{
  const storage = createMemoryStorage()

  return {
    ...storage,
    setItem: (key, value) =>
    {
      if (blockedKeys.has(key))
      {
        throw new DOMException('quota', 'QuotaExceededError')
      }

      storage.setItem(key, value)
    },
  } as Storage
}

describe('boardStorage sync metadata', () =>
{
  beforeEach(() =>
  {
    vi.stubGlobal('localStorage', createMemoryStorage())
  })

  afterEach(() =>
  {
    vi.unstubAllGlobals()
  })

  it('persists sync metadata alongside the board snapshot', () =>
  {
    const snapshot = createInitialBoardData('classic')
    saveBoardToStorage(TEST_BOARD_ID, snapshot, {
      syncState: {
        lastSyncedRevision: 12,
        cloudBoardExternalId: 'cloud-board-12',
        pendingSyncAt: null,
      },
    })

    expect(localStorage.getItem(boardStorageKey(TEST_BOARD_ID))).toContain(
      '"data"'
    )
    expect(localStorage.getItem(boardSyncStorageKey(TEST_BOARD_ID))).toBe(
      JSON.stringify({
        lastSyncedRevision: 12,
        cloudBoardExternalId: 'cloud-board-12',
        pendingSyncAt: null,
      })
    )

    const loaded = loadBoardFromStorage(TEST_BOARD_ID)
    expect(loaded).toMatchObject({
      status: 'ok',
      sync: {
        lastSyncedRevision: 12,
        cloudBoardExternalId: 'cloud-board-12',
        pendingSyncAt: null,
      },
    })
  })

  it('preserves existing sync metadata when autosave rewrites the snapshot', () =>
  {
    const snapshot = createInitialBoardData('classic')
    saveBoardToStorage(TEST_BOARD_ID, snapshot, {
      syncState: {
        lastSyncedRevision: 4,
        cloudBoardExternalId: 'cloud-board-4',
        pendingSyncAt: null,
      },
    })

    saveBoardToStorage(TEST_BOARD_ID, {
      ...snapshot,
      title: 'Updated title',
    })

    const loaded = loadBoardFromStorage(TEST_BOARD_ID)
    expect(loaded).toMatchObject({
      status: 'ok',
      data: { title: 'Updated title' },
      sync: {
        lastSyncedRevision: 4,
        cloudBoardExternalId: 'cloud-board-4',
        pendingSyncAt: null,
      },
    })
  })

  it('updates sync metadata without touching the saved board payload', () =>
  {
    const snapshot = {
      ...createInitialBoardData('classic'),
      title: 'Latest local board',
    }
    saveBoardToStorage(TEST_BOARD_ID, snapshot)
    const storedBoardPayload = localStorage.getItem(
      boardStorageKey(TEST_BOARD_ID)
    )

    saveBoardSyncToStorage(TEST_BOARD_ID, {
      lastSyncedRevision: 7,
      cloudBoardExternalId: 'cloud-board-7',
      pendingSyncAt: null,
    })

    expect(localStorage.getItem(boardStorageKey(TEST_BOARD_ID))).toBe(
      storedBoardPayload
    )
    const loaded = loadBoardFromStorage(TEST_BOARD_ID)
    expect(loaded).toMatchObject({
      status: 'ok',
      data: { title: 'Latest local board' },
      sync: {
        lastSyncedRevision: 7,
        cloudBoardExternalId: 'cloud-board-7',
        pendingSyncAt: null,
      },
    })
  })

  it('returns an empty sync state when no sidecar key exists', () =>
  {
    const snapshot = createInitialBoardData('classic')
    localStorage.setItem(
      boardStorageKey(TEST_BOARD_ID),
      JSON.stringify({
        version: 3,
        data: snapshot,
      })
    )

    const loaded = loadBoardFromStorage(TEST_BOARD_ID)
    expect(loaded).toMatchObject({
      status: 'ok',
      sync: EMPTY_BOARD_SYNC_STATE,
    })
  })

  it('rejects arbitrary JSON that lacks the envelope shape', () =>
  {
    localStorage.setItem(
      boardStorageKey(TEST_BOARD_ID),
      JSON.stringify({
        hello: 'world',
      })
    )

    expect(loadBoardFromStorage(TEST_BOARD_ID)).toMatchObject({
      status: 'corrupted',
      data: null,
      sync: EMPTY_BOARD_SYNC_STATE,
    })
  })

  it('rejects an unwrapped pre-v3 board payload', () =>
  {
    localStorage.setItem(
      boardStorageKey(TEST_BOARD_ID),
      JSON.stringify({
        tiers: [],
        items: {},
        unrankedItemIds: [],
        deletedItems: [],
      })
    )

    expect(loadBoardFromStorage(TEST_BOARD_ID)).toMatchObject({
      status: 'corrupted',
      data: null,
      sync: EMPTY_BOARD_SYNC_STATE,
    })
  })

  it('rejects a wrapped envelope missing the version field', () =>
  {
    const snapshot = createInitialBoardData('classic')
    localStorage.setItem(
      boardStorageKey(TEST_BOARD_ID),
      JSON.stringify({
        data: snapshot,
      })
    )

    expect(loadBoardFromStorage(TEST_BOARD_ID)).toMatchObject({
      status: 'corrupted',
      data: null,
      sync: EMPTY_BOARD_SYNC_STATE,
    })
  })

  it('rejects a wrapped envelope with a version above the supported maximum', () =>
  {
    const snapshot = createInitialBoardData('classic')
    localStorage.setItem(
      boardStorageKey(TEST_BOARD_ID),
      JSON.stringify({
        version: 999,
        data: snapshot,
      })
    )

    expect(loadBoardFromStorage(TEST_BOARD_ID)).toMatchObject({
      status: 'corrupted',
      data: null,
      sync: EMPTY_BOARD_SYNC_STATE,
    })
  })

  it('returns a failed write result without persisting sync metadata first', () =>
  {
    vi.stubGlobal(
      'localStorage',
      createFailingStorage(new Set([boardStorageKey(TEST_BOARD_ID)]))
    )

    const snapshot = createInitialBoardData('classic')
    const result = saveBoardToStorage(TEST_BOARD_ID, snapshot, {
      syncState: {
        lastSyncedRevision: 9,
        cloudBoardExternalId: 'cloud-board-9',
        pendingSyncAt: null,
      },
    })

    expect(result).toMatchObject({ ok: false })
    expect(localStorage.getItem(boardStorageKey(TEST_BOARD_ID))).toBeNull()
    expect(localStorage.getItem(boardSyncStorageKey(TEST_BOARD_ID))).toBeNull()
  })
})
