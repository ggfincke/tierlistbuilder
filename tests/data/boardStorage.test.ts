// tests/data/boardStorage.test.ts
// local board storage envelope I/O

import { describe, expect, it, vi } from 'vitest'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { createInitialBoardData } from '~/shared/board-data/boardSnapshot'
import { BOARD_DATA_VERSION } from '@tierlistbuilder/contracts/workspace/boardEnvelope'
import {
  boardStorageKey,
  boardSyncStorageKey,
  loadBoardFromStorage,
  saveBoardSyncToStorage,
  saveBoardToStorage,
} from '~/features/workspace/boards/data/local/boardStorage'
import { EMPTY_BOARD_SYNC_STATE } from '~/features/workspace/boards/model/sync'
import { createFailingStorage } from '../shared-lib/memoryStorage'

const TEST_BOARD_ID = 'board-storage-test' as BoardId

describe('boardStorage sync metadata', () =>
{
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
        version: BOARD_DATA_VERSION,
        data: snapshot,
      })
    )

    const loaded = loadBoardFromStorage(TEST_BOARD_ID)
    expect(loaded).toMatchObject({
      status: 'ok',
      sync: EMPTY_BOARD_SYNC_STATE,
    })
  })

  it.each([
    ['arbitrary JSON without envelope shape', { hello: 'world' }],
    [
      'unwrapped board payload',
      { tiers: [], items: {}, unrankedItemIds: [], deletedItems: [] },
    ],
    [
      'wrapped envelope missing version',
      { data: createInitialBoardData('classic') },
    ],
    [
      'wrapped envelope with unsupported version',
      { version: 999, data: createInitialBoardData('classic') },
    ],
  ])('rejects %s as corrupted', (_label, payload) =>
  {
    localStorage.setItem(
      boardStorageKey(TEST_BOARD_ID),
      JSON.stringify(payload)
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
