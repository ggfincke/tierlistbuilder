// tests/data/boardStorage.test.ts
// per-board localStorage envelope I/O & corruption handling

import { describe, expect, it, vi } from 'vitest'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { createInitialBoardData } from '~/shared/board-data/boardSnapshot'
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

describe('boardStorage', () =>
{
  it('round-trips snapshot + sync metadata & preserves sync across snapshot rewrites', () =>
  {
    const snapshot = createInitialBoardData('classic')
    const syncState = {
      lastSyncedRevision: 12,
      cloudBoardExternalId: 'cloud-board-12',
      pendingSyncAt: null,
    }
    saveBoardToStorage(TEST_BOARD_ID, snapshot, { syncState })

    expect(loadBoardFromStorage(TEST_BOARD_ID)).toMatchObject({
      status: 'ok',
      sync: syncState,
    })

    saveBoardToStorage(TEST_BOARD_ID, { ...snapshot, title: 'Updated title' })
    expect(loadBoardFromStorage(TEST_BOARD_ID)).toMatchObject({
      status: 'ok',
      data: { title: 'Updated title' },
      sync: syncState,
    })

    const beforeSyncWrite = localStorage.getItem(boardStorageKey(TEST_BOARD_ID))
    saveBoardSyncToStorage(TEST_BOARD_ID, {
      lastSyncedRevision: 7,
      cloudBoardExternalId: 'cloud-board-7',
      pendingSyncAt: null,
    })
    expect(localStorage.getItem(boardStorageKey(TEST_BOARD_ID))).toBe(
      beforeSyncWrite
    )
    expect(loadBoardFromStorage(TEST_BOARD_ID)).toMatchObject({
      status: 'ok',
      sync: { lastSyncedRevision: 7 },
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

    const result = saveBoardToStorage(
      TEST_BOARD_ID,
      createInitialBoardData('classic'),
      {
        syncState: {
          lastSyncedRevision: 9,
          cloudBoardExternalId: 'cloud-board-9',
          pendingSyncAt: null,
        },
      }
    )

    expect(result).toMatchObject({ ok: false })
    expect(localStorage.getItem(boardStorageKey(TEST_BOARD_ID))).toBeNull()
    expect(localStorage.getItem(boardSyncStorageKey(TEST_BOARD_ID))).toBeNull()
  })
})
