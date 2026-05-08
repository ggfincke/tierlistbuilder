// tests/model/boardSession.test.ts
// board session sync persistence & autosave/delete listener behavior

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { createInitialBoardData } from '~/shared/board-data/boardSnapshot'
import {
  boardStorageKey,
  boardSyncStorageKey,
} from '~/features/workspace/boards/data/local/boardStorage'
import {
  deleteBoardSession,
  loadBoardIntoSession,
  persistBoardStateForSync,
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
    boards: [{ id: TEST_BOARD_ID, title: 'Board', createdAt: Date.now() }],
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
    activeItemCount: 0,
    runtimeError: null,
    lastSyncedRevision: null,
    cloudBoardExternalId: null,
    pendingSyncAt: null,
  })
}

describe('board session', () =>
{
  let disposeAutosave: (() => void) | null = null

  beforeEach(() => resetStores())
  afterEach(() =>
  {
    disposeAutosave?.()
    disposeAutosave = null
    setBoardLoadedListener(null)
    setBoardDeletedListener(null)
    resetStores()
    vi.useRealTimers()
  })

  it('keeps active sync state in memory when persistence fails', () =>
  {
    vi.stubGlobal(
      'localStorage',
      createFailingStorage(new Set([boardStorageKey(TEST_BOARD_ID)]))
    )

    const ok = persistBoardStateForSync(
      TEST_BOARD_ID,
      { ...createInitialBoardData('classic'), title: 'Updated' },
      {
        lastSyncedRevision: 3,
        cloudBoardExternalId: 'cloud-a',
        pendingSyncAt: 123,
      }
    )

    expect(ok).toBe(false)
    expect(useActiveBoardStore.getState()).toMatchObject({
      lastSyncedRevision: 3,
      pendingSyncAt: 123,
    })
    expect(localStorage.getItem(boardStorageKey(TEST_BOARD_ID))).toBeNull()
    expect(localStorage.getItem(boardSyncStorageKey(TEST_BOARD_ID))).toBeNull()
  })

  it('notifies board-loaded listener before the registry active id flips', async () =>
  {
    useWorkspaceBoardRegistryStore.setState({
      boards: [
        { id: OTHER_BOARD_ID, title: 'Old', createdAt: Date.now() },
        { id: TEST_BOARD_ID, title: 'Loaded', createdAt: Date.now() },
      ],
      activeBoardId: OTHER_BOARD_ID,
    })
    saveBoardToStorage(TEST_BOARD_ID, {
      ...createInitialBoardData('classic'),
      title: 'Loaded',
    })

    const loadedIds: BoardId[] = []
    setBoardLoadedListener((id) => loadedIds.push(id))
    await loadBoardIntoSession(TEST_BOARD_ID)

    expect(loadedIds).toEqual([TEST_BOARD_ID])
    expect(useActiveBoardStore.getState().title).toBe('Loaded')
    expect(useWorkspaceBoardRegistryStore.getState().activeBoardId).toBe(
      OTHER_BOARD_ID
    )
  })

  it('autosaves active board after one debounce window', () =>
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
    expect(
      JSON.parse(localStorage.getItem(boardStorageKey(TEST_BOARD_ID)) ?? '{}')
        .data?.title
    ).toBe('Board')

    vi.advanceTimersByTime(1)
    expect(
      JSON.parse(localStorage.getItem(boardStorageKey(TEST_BOARD_ID)) ?? '{}')
        .data?.title
    ).toBe('Autosaved')
  })

  it('stamps pending cloud deletes & notifies the delete listener', async () =>
  {
    useWorkspaceBoardRegistryStore.setState({
      boards: [
        { id: TEST_BOARD_ID, title: 'Board', createdAt: Date.now() },
        { id: OTHER_BOARD_ID, title: 'Other', createdAt: Date.now() },
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

    let notified = false
    setBoardDeletedListener(() => (notified = true))
    await deleteBoardSession(TEST_BOARD_ID)

    expect(notified).toBe(true)
    expect(loadBoardDeleteSyncMeta().pendingExternalIds).toEqual([
      'cloud-board-a',
    ])
    expect(
      useWorkspaceBoardRegistryStore
        .getState()
        .boards.some((b) => b.id === TEST_BOARD_ID)
    ).toBe(false)
  })
})
