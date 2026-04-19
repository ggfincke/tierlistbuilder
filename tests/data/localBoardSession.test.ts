// tests/data/localBoardSession.test.ts
// board session sync persistence behavior

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { createInitialBoardData } from '~/features/workspace/boards/model/boardSnapshot'
import {
  boardStorageKey,
  boardSyncStorageKey,
} from '~/features/workspace/boards/data/local/boardStorage'
import {
  persistBoardStateForSync,
  persistBoardSyncState,
} from '~/features/workspace/boards/data/local/localBoardSession'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import {
  createFailingStorage,
  createMemoryStorage,
} from '../utils/memoryStorage'

const TEST_BOARD_ID = 'board-local-session-test' as BoardId

const resetStores = (): void =>
{
  useWorkspaceBoardRegistryStore.setState({
    boards: [
      {
        id: TEST_BOARD_ID,
        title: 'Board',
        createdAt: Date.now(),
      },
    ],
    activeBoardId: TEST_BOARD_ID,
  })

  useActiveBoardStore.setState({
    ...createInitialBoardData('classic'),
    title: 'Board',
    past: [],
    future: [],
    activeItemId: null,
    dragPreview: null,
    dragGroupIds: [],
    keyboardMode: 'idle',
    keyboardFocusItemId: null,
    selection: { ids: [], set: new Set() },
    lastClickedItemId: null,
    itemsManuallyMoved: false,
    runtimeError: null,
    lastSyncedRevision: null,
    cloudBoardExternalId: null,
    pendingSyncAt: null,
  })
}

describe('local board session sync persistence', () =>
{
  beforeEach(() =>
  {
    vi.stubGlobal('localStorage', createMemoryStorage())
    resetStores()
  })

  afterEach(() =>
  {
    resetStores()
    vi.unstubAllGlobals()
  })

  it('keeps active sync state in memory when snapshot persistence fails', () =>
  {
    vi.stubGlobal(
      'localStorage',
      createFailingStorage(new Set([boardStorageKey(TEST_BOARD_ID)]))
    )

    const ok = persistBoardStateForSync(
      TEST_BOARD_ID,
      {
        ...createInitialBoardData('classic'),
        title: 'Updated',
      },
      {
        lastSyncedRevision: 3,
        cloudBoardExternalId: 'cloud-a',
        pendingSyncAt: 123,
      }
    )

    expect(ok).toBe(false)
    expect(useActiveBoardStore.getState().lastSyncedRevision).toBe(3)
    expect(useActiveBoardStore.getState().pendingSyncAt).toBe(123)
    expect(localStorage.getItem(boardStorageKey(TEST_BOARD_ID))).toBeNull()
    expect(localStorage.getItem(boardSyncStorageKey(TEST_BOARD_ID))).toBeNull()
  })

  it('keeps active sync state in memory when sync-sidecar persistence fails', () =>
  {
    vi.stubGlobal(
      'localStorage',
      createFailingStorage(new Set([boardSyncStorageKey(TEST_BOARD_ID)]))
    )

    persistBoardSyncState(TEST_BOARD_ID, {
      lastSyncedRevision: 9,
      cloudBoardExternalId: 'cloud-a',
      pendingSyncAt: null,
    })

    expect(useActiveBoardStore.getState().lastSyncedRevision).toBe(9)
    expect(useActiveBoardStore.getState().cloudBoardExternalId).toBe('cloud-a')
    expect(localStorage.getItem(boardSyncStorageKey(TEST_BOARD_ID))).toBeNull()
  })
})
