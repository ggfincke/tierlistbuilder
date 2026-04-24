// tests/model/boardSession.test.ts
// board session sync persistence behavior

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { createInitialBoardData } from '~/features/workspace/boards/model/boardSnapshot'
import {
  boardStorageKey,
  boardSyncStorageKey,
} from '~/features/workspace/boards/data/local/boardStorage'
import {
  deleteBoardSession,
  loadBoardIntoSession,
  persistBoardStateForSync,
  persistBoardSyncState,
  registerBoardAutosave,
  setBoardLoadedListener,
  setBoardDeletedListener,
} from '~/features/workspace/boards/model/boardSession'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { saveBoardToStorage } from '~/features/workspace/boards/data/local/boardStorage'
import { loadBoardDeleteSyncMeta } from '~/features/workspace/boards/data/local/boardDeleteSyncMeta'
import { createFailingStorage } from '../shared-lib/memoryStorage'

const TEST_BOARD_ID = 'board-local-session-test' as BoardId
const OTHER_BOARD_ID = 'board-local-session-other' as BoardId

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

describe('board session sync persistence', () =>
{
  let disposeAutosave: (() => void) | null = null

  beforeEach(() =>
  {
    resetStores()
  })

  afterEach(() =>
  {
    disposeAutosave?.()
    disposeAutosave = null
    setBoardLoadedListener(null)
    setBoardDeletedListener(null)
    resetStores()
    vi.useRealTimers()
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

  it('notifies board loads even before the registry active id flips', async () =>
  {
    useWorkspaceBoardRegistryStore.setState({
      boards: [
        {
          id: OTHER_BOARD_ID,
          title: 'Old board',
          createdAt: Date.now(),
        },
        {
          id: TEST_BOARD_ID,
          title: 'Loaded board',
          createdAt: Date.now(),
        },
      ],
      activeBoardId: OTHER_BOARD_ID,
    })

    saveBoardToStorage(TEST_BOARD_ID, {
      ...createInitialBoardData('classic'),
      title: 'Loaded board',
    })

    const loadedBoardIds: BoardId[] = []
    setBoardLoadedListener((boardId) =>
    {
      loadedBoardIds.push(boardId)
    })

    await loadBoardIntoSession(TEST_BOARD_ID)

    expect(loadedBoardIds).toEqual([TEST_BOARD_ID])
    expect(useActiveBoardStore.getState().title).toBe('Loaded board')
    expect(useWorkspaceBoardRegistryStore.getState().activeBoardId).toBe(
      OTHER_BOARD_ID
    )
  })

  it('autosaves active board data after one debounce window', () =>
  {
    vi.useFakeTimers()
    saveBoardToStorage(TEST_BOARD_ID, {
      ...createInitialBoardData('classic'),
      title: 'Board',
    })

    disposeAutosave = registerBoardAutosave()
    expect(registerBoardAutosave()).toBe(disposeAutosave)

    useActiveBoardStore.setState({ title: 'Autosaved' })
    vi.advanceTimersByTime(299)

    const before = JSON.parse(
      localStorage.getItem(boardStorageKey(TEST_BOARD_ID)) ?? '{}'
    ) as { data?: { title?: string } }
    expect(before.data?.title).toBe('Board')

    vi.advanceTimersByTime(1)

    const after = JSON.parse(
      localStorage.getItem(boardStorageKey(TEST_BOARD_ID)) ?? '{}'
    ) as { data?: { title?: string } }
    expect(after.data?.title).toBe('Autosaved')
  })

  it('stamps cloud deletes and notifies the delete listener', async () =>
  {
    useWorkspaceBoardRegistryStore.setState({
      boards: [
        {
          id: TEST_BOARD_ID,
          title: 'Board',
          createdAt: Date.now(),
        },
        {
          id: OTHER_BOARD_ID,
          title: 'Other board',
          createdAt: Date.now(),
        },
      ],
      activeBoardId: OTHER_BOARD_ID,
    })
    saveBoardToStorage(TEST_BOARD_ID, createInitialBoardData('classic'), {
      syncState: {
        lastSyncedRevision: 4,
        cloudBoardExternalId: 'cloud-board-a',
        pendingSyncAt: null,
      },
    })

    let deleteNotified = false
    setBoardDeletedListener(() =>
    {
      deleteNotified = true
    })

    await deleteBoardSession(TEST_BOARD_ID)

    expect(deleteNotified).toBe(true)
    expect(loadBoardDeleteSyncMeta().pendingExternalIds).toEqual([
      'cloud-board-a',
    ])
    expect(
      useWorkspaceBoardRegistryStore
        .getState()
        .boards.some((board) => board.id === TEST_BOARD_ID)
    ).toBe(false)
  })
})
