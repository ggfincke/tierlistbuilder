import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  BoardListItem,
  BoardMeta,
} from '@tierlistbuilder/contracts/workspace/board'
import { asItemId, type BoardId } from '@tierlistbuilder/contracts/lib/ids'
import {
  clearCloudPullCompleted,
  decideFirstLoginMerge,
  hasCompletedCloudPull,
  hasPendingCloudPull,
  markCloudPullCompleted,
  markCloudPullPending,
} from '~/features/platform/sync/boards/cloudMerge'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { createInitialBoardData } from '~/features/workspace/boards/model/boardSnapshot'
import { makeBoardSnapshot } from '../fixtures'

const TEST_USER_ID = 'user-1'
const LOCAL_BOARD_ID = 'board-local' as BoardId
const LOCAL_BOARD: BoardMeta = {
  id: LOCAL_BOARD_ID,
  title: 'Local board',
  createdAt: 1,
}
const CLOUD_BOARD: BoardListItem = {
  externalId: 'board-cloud',
  title: 'Cloud board',
  createdAt: 1,
  updatedAt: 1,
  revision: 1,
}

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

// seed the registry & active store so readBoardStateForCloudSync resolves
// against the in-memory active-board path instead of falling through to
// storage. tests that exercise the active-board branch call this directly
const seedActiveBoard = (
  id: BoardId,
  snapshot: ReturnType<typeof makeBoardSnapshot>
): void =>
{
  useWorkspaceBoardRegistryStore.setState({
    boards: [{ id, title: snapshot.title, createdAt: 1 }],
    activeBoardId: id,
  })
  useActiveBoardStore.getState().loadBoard(snapshot)
}

const resetStores = (): void =>
{
  useWorkspaceBoardRegistryStore.setState({
    boards: [],
    activeBoardId: '',
  })
  useActiveBoardStore.getState().loadBoard(createInitialBoardData('classic'))
}

describe('cloudMerge', () =>
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

  it('tracks pending vs completed cloud pull state', () =>
  {
    expect(hasCompletedCloudPull(TEST_USER_ID)).toBe(false)
    expect(hasPendingCloudPull(TEST_USER_ID)).toBe(false)

    markCloudPullPending(TEST_USER_ID)

    expect(hasCompletedCloudPull(TEST_USER_ID)).toBe(false)
    expect(hasPendingCloudPull(TEST_USER_ID)).toBe(true)

    markCloudPullCompleted(TEST_USER_ID)

    expect(hasCompletedCloudPull(TEST_USER_ID)).toBe(true)
    expect(hasPendingCloudPull(TEST_USER_ID)).toBe(false)

    clearCloudPullCompleted(TEST_USER_ID)

    expect(hasCompletedCloudPull(TEST_USER_ID)).toBe(false)
    expect(hasPendingCloudPull(TEST_USER_ID)).toBe(false)
  })

  it('resumes a pending cloud pull instead of treating the workspace as a conflict', () =>
  {
    markCloudPullPending(TEST_USER_ID)

    expect(
      decideFirstLoginMerge([CLOUD_BOARD], [LOCAL_BOARD], TEST_USER_ID)
    ).toEqual({ action: 'resume-pull-cloud' })
  })

  it('uses in-memory active-board data when classifying default local state', () =>
  {
    seedActiveBoard(
      LOCAL_BOARD_ID,
      makeBoardSnapshot({
        title: 'Unsaved edit',
        unrankedItemIds: [asItemId('item-1')],
        items: {
          [asItemId('item-1')]: {
            id: asItemId('item-1'),
            label: 'Unsaved item',
          },
        },
      })
    )

    expect(
      decideFirstLoginMerge([CLOUD_BOARD], [LOCAL_BOARD], TEST_USER_ID)
    ).toEqual({ action: 'conflict' })
  })
})
