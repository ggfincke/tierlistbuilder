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
      },
    })

    expect(localStorage.getItem(boardStorageKey(TEST_BOARD_ID))).toContain(
      '"data"'
    )
    expect(localStorage.getItem(boardSyncStorageKey(TEST_BOARD_ID))).toBe(
      JSON.stringify({
        lastSyncedRevision: 12,
        cloudBoardExternalId: 'cloud-board-12',
      })
    )

    const loaded = loadBoardFromStorage(TEST_BOARD_ID)
    expect(loaded).toMatchObject({
      status: 'ok',
      sync: {
        lastSyncedRevision: 12,
        cloudBoardExternalId: 'cloud-board-12',
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
      },
    })
  })

  it('loads sync metadata from a legacy combined envelope and migrates it', () =>
  {
    const snapshot = createInitialBoardData('classic')
    localStorage.setItem(
      boardStorageKey(TEST_BOARD_ID),
      JSON.stringify({
        version: 3,
        data: snapshot,
        sync: {
          lastSyncedRevision: 21,
          cloudBoardExternalId: 'cloud-board-21',
        },
      })
    )

    const loaded = loadBoardFromStorage(TEST_BOARD_ID)
    expect(loaded).toMatchObject({
      status: 'ok',
      sync: {
        lastSyncedRevision: 21,
        cloudBoardExternalId: 'cloud-board-21',
      },
    })
    expect(localStorage.getItem(boardSyncStorageKey(TEST_BOARD_ID))).toBe(
      JSON.stringify({
        lastSyncedRevision: 21,
        cloudBoardExternalId: 'cloud-board-21',
      })
    )
  })

  it('defaults legacy board payloads to an empty sync state', () =>
  {
    const snapshot = createInitialBoardData('classic')
    localStorage.setItem(
      boardStorageKey(TEST_BOARD_ID),
      JSON.stringify({
        version: 2,
        data: snapshot,
      })
    )

    const loaded = loadBoardFromStorage(TEST_BOARD_ID)
    expect(loaded).toMatchObject({
      status: 'ok',
      sync: EMPTY_BOARD_SYNC_STATE,
    })
  })

  it('rejects arbitrary JSON on the raw payload fallback path', () =>
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
})
