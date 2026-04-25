// tests/data/boardStorage.test.ts
// local board storage envelope I/O

import { describe, expect, it, vi } from 'vitest'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { createInitialBoardData } from '~/features/workspace/boards/model/boardSnapshot'
import { BOARD_DATA_VERSION } from '@tierlistbuilder/contracts/workspace/boardEnvelope'
import {
  boardStorageKey,
  loadBoardFromStorage,
  saveBoardToStorage,
} from '~/features/workspace/boards/data/local/boardStorage'
import { createFailingStorage } from '../shared-lib/memoryStorage'

const TEST_BOARD_ID = 'board-storage-test' as BoardId

describe('boardStorage', () =>
{
  it('persists and loads a board snapshot envelope', () =>
  {
    const snapshot = {
      ...createInitialBoardData('classic'),
      title: 'Stored board',
    }

    saveBoardToStorage(TEST_BOARD_ID, snapshot)

    expect(localStorage.getItem(boardStorageKey(TEST_BOARD_ID))).toContain(
      '"data"'
    )
    expect(loadBoardFromStorage(TEST_BOARD_ID)).toMatchObject({
      status: 'ok',
      data: { title: 'Stored board' },
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
    })
  })

  it('accepts the current storage version', () =>
  {
    const snapshot = createInitialBoardData('classic')
    localStorage.setItem(
      boardStorageKey(TEST_BOARD_ID),
      JSON.stringify({
        version: BOARD_DATA_VERSION,
        data: snapshot,
      })
    )

    expect(loadBoardFromStorage(TEST_BOARD_ID)).toMatchObject({
      status: 'ok',
    })
  })

  it('returns a failed write result when localStorage rejects the board key', () =>
  {
    vi.stubGlobal(
      'localStorage',
      createFailingStorage(new Set([boardStorageKey(TEST_BOARD_ID)]))
    )

    const result = saveBoardToStorage(
      TEST_BOARD_ID,
      createInitialBoardData('classic')
    )

    expect(result).toMatchObject({ ok: false })
    expect(localStorage.getItem(boardStorageKey(TEST_BOARD_ID))).toBeNull()
  })
})
