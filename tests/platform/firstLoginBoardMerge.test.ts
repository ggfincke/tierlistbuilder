// tests/platform/firstLoginBoardMerge.test.ts
// first-login board merge retry behavior

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BoardMeta } from '@tierlistbuilder/contracts/workspace/board'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import {
  pushAllLocalBoards,
  runFirstLoginBoardMerge,
  type FirstLoginBoardMergeDeps,
} from '~/features/workspace/boards/data/cloud/firstLoginBoardMerge'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { makeBoardSnapshot } from '../fixtures'

const makeBoardMeta = (id: BoardId): BoardMeta => ({
  id,
  title: id,
  createdAt: 1,
})

const resetRegistry = (): void =>
{
  useWorkspaceBoardRegistryStore.setState({
    boards: [],
    activeBoardId: null,
  })
}

const createDeps = (
  overrides: Partial<FirstLoginBoardMergeDeps> = {}
): FirstLoginBoardMergeDeps => ({
  listMyBoards: async () => [],
  pullAllCloudBoards: async () => ({
    kind: 'success',
    attemptedCount: 0,
    pulledCount: 0,
    failedCount: 0,
    loadedBoardId: null,
  }),
  decideFirstLoginMerge: () => ({ action: 'skip' }),
  hasCompletedCloudPull: () => false,
  markCloudPullCompleted: vi.fn(),
  markCloudPullPending: vi.fn(),
  flushBoardToCloud: async () => ({ kind: 'synced', revision: 1 }),
  readBoardStateForCloudSync: (boardId) => ({
    snapshot: makeBoardSnapshot({ title: boardId }),
    syncState: {
      lastSyncedRevision: null,
      cloudBoardExternalId: null,
      pendingSyncAt: null,
    },
  }),
  persistBoardSyncState: vi.fn(),
  notify: vi.fn(),
  loggerWarn: vi.fn(),
  now: () => 1234,
  ...overrides,
})

describe('firstLoginBoardMerge', () =>
{
  afterEach(() =>
  {
    resetRegistry()
    vi.restoreAllMocks()
  })

  it('marks failed first-login pushes as pending so they can resume later', async () =>
  {
    useWorkspaceBoardRegistryStore.setState({
      boards: [
        makeBoardMeta('board-a' as BoardId),
        makeBoardMeta('board-b' as BoardId),
      ],
      activeBoardId: null,
    })

    const persistBoardSyncState = vi.fn()
    const deps = createDeps({
      flushBoardToCloud: async (_snapshot, boardExternalId) =>
        boardExternalId === 'board-a'
          ? { kind: 'synced', revision: 7 }
          : {
              kind: 'error',
              error: {
                kind: 'unknown',
                permanent: false,
                cause: new Error('boom'),
              },
            },
      persistBoardSyncState,
    })

    const result = await pushAllLocalBoards('user-a', () => true, deps)

    expect(result).toEqual({
      failedBoardIds: ['board-b'],
      aborted: false,
    })
    expect(persistBoardSyncState).toHaveBeenCalledWith('board-a', {
      lastSyncedRevision: 7,
      cloudBoardExternalId: 'board-a',
      pendingSyncAt: null,
    })
    expect(persistBoardSyncState).toHaveBeenCalledWith('board-b', {
      lastSyncedRevision: null,
      cloudBoardExternalId: null,
      pendingSyncAt: 1234,
    })
  })

  it('marks no-op resumed pulls as completed', async () =>
  {
    const markCloudPullCompleted = vi.fn()
    const markCloudPullPending = vi.fn()
    const deps = createDeps({
      listMyBoards: async () => [
        {
          externalId: 'cloud-a',
          title: 'Cloud A',
          createdAt: 1,
          updatedAt: 2,
          revision: 3,
        },
      ],
      decideFirstLoginMerge: () => ({ action: 'resume-pull-cloud' }),
      markCloudPullCompleted,
      markCloudPullPending,
    })

    await runFirstLoginBoardMerge('user-a', () => true, deps)

    expect(markCloudPullPending).toHaveBeenCalledWith('user-a')
    expect(markCloudPullCompleted).toHaveBeenCalledWith('user-a')
  })
})
