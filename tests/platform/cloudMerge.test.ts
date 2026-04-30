// tests/platform/cloudMerge.test.ts
// first-login cloud merge decisions

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { asItemId, type BoardId } from '@tierlistbuilder/contracts/lib/ids'
import {
  decideFirstLoginMerge,
  hasCompletedCloudPull,
  hasPendingCloudPull,
  markCloudPullCompleted,
  markCloudPullPending,
} from '~/features/workspace/boards/data/cloud/cloudMerge'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { createInitialBoardData } from '~/shared/board-data/boardSnapshot'
import {
  makeBoardListItem,
  makeBoardMeta,
  makeBoardSnapshot,
} from '../fixtures'

const TEST_USER_ID = 'user-1'
const LOCAL_BOARD_ID = 'board-local' as BoardId
const LOCAL_BOARD = makeBoardMeta({
  id: LOCAL_BOARD_ID,
  title: 'Local board',
})
const CLOUD_BOARD = makeBoardListItem({
  externalId: 'board-cloud',
  title: 'Cloud board',
})

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
    activeBoardId: null,
  })
  useActiveBoardStore.getState().loadBoard(createInitialBoardData('classic'))
}

describe('cloudMerge', () =>
{
  beforeEach(() =>
  {
    resetStores()
  })

  afterEach(() =>
  {
    resetStores()
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

    markCloudPullPending(TEST_USER_ID)

    expect(hasCompletedCloudPull(TEST_USER_ID)).toBe(false)
    expect(hasPendingCloudPull(TEST_USER_ID)).toBe(true)
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
