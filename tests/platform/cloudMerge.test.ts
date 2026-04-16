import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  BoardListItem,
  BoardMeta,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  clearCloudPullCompleted,
  decideFirstLoginMerge,
  hasCompletedCloudPull,
  hasPendingCloudPull,
  markCloudPullCompleted,
  markCloudPullPending,
} from '~/features/platform/sync/cloudMerge'

const { readBoardStateForCloudSyncMock } = vi.hoisted(() => ({
  readBoardStateForCloudSyncMock: vi.fn(),
}))

vi.mock('~/features/platform/sync/cloudFlush', () => ({
  readBoardStateForCloudSync: readBoardStateForCloudSyncMock,
}))

const TEST_USER_ID = 'user-1'
const LOCAL_BOARD: BoardMeta = {
  id: 'board-local' as const,
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

describe('cloudMerge', () =>
{
  beforeEach(() =>
  {
    vi.stubGlobal('localStorage', createMemoryStorage())
    readBoardStateForCloudSyncMock.mockReset()
  })

  afterEach(() =>
  {
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

    readBoardStateForCloudSyncMock.mockReturnValue({
      snapshot: {
        title: 'Local board',
        tiers: [],
        unrankedItemIds: [],
        items: {},
        deletedItems: [],
      },
      syncState: {
        lastSyncedRevision: 1,
        cloudBoardExternalId: 'board-local',
      },
    })

    expect(
      decideFirstLoginMerge([CLOUD_BOARD], [LOCAL_BOARD], TEST_USER_ID)
    ).toEqual({ action: 'resume-pull-cloud' })
  })

  it('uses in-memory active-board data when classifying default local state', () =>
  {
    readBoardStateForCloudSyncMock.mockReturnValue({
      snapshot: {
        title: 'Unsaved edit',
        tiers: [],
        unrankedItemIds: ['item-1'],
        items: {
          'item-1': {
            id: 'item-1',
            label: 'Unsaved item',
          },
        },
        deletedItems: [],
      },
      syncState: {
        lastSyncedRevision: null,
        cloudBoardExternalId: null,
      },
    })

    expect(
      decideFirstLoginMerge([CLOUD_BOARD], [LOCAL_BOARD], TEST_USER_ID)
    ).toEqual({ action: 'conflict' })
  })
})
