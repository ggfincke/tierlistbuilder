// tests/platform/firstLoginBoardMerge.test.ts
// first-login board merge: pending markers, permanent failures, & resume paths

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import {
  pushAllLocalBoards,
  runFirstLoginBoardMerge,
  type FirstLoginBoardMergeDeps,
} from '~/features/workspace/boards/data/cloud/firstLoginBoardMerge'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { makeBoardMeta, makeBoardSnapshot } from '../fixtures'

const resetRegistry = (): void =>
{
  useWorkspaceBoardRegistryStore.setState({ boards: [], activeBoardId: null })
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

  it('marks transient failures as pendingSyncAt & keeps permanent failures pending w/ existing meta', async () =>
  {
    useWorkspaceBoardRegistryStore.setState({
      boards: [
        makeBoardMeta({ id: 'board-a' as BoardId, title: 'board-a' }),
        makeBoardMeta({ id: 'board-b' as BoardId, title: 'board-b' }),
        makeBoardMeta({ id: 'board-c' as BoardId, title: 'board-c' }),
      ],
      activeBoardId: null,
    })

    const persistBoardSyncState = vi.fn()
    const deps = createDeps({
      flushBoardToCloud: async (_snapshot, externalId) =>
      {
        if (externalId === 'board-a')
        {
          return { kind: 'synced', revision: 7 }
        }
        if (externalId === 'board-b')
        {
          return {
            kind: 'error',
            error: {
              kind: 'unknown',
              permanent: false,
              cause: new Error('boom'),
            },
          }
        }
        return {
          kind: 'error',
          error: {
            kind: 'local-permanent',
            code: 'missing-local-image-blobs',
            permanent: true,
            cause: new Error('missing local blobs'),
          },
        }
      },
      readBoardStateForCloudSync: (boardId) => ({
        snapshot: makeBoardSnapshot({ title: boardId }),
        syncState:
          boardId === 'board-c'
            ? {
                lastSyncedRevision: 4,
                cloudBoardExternalId: 'cloud-c',
                pendingSyncAt: 456,
              }
            : {
                lastSyncedRevision: null,
                cloudBoardExternalId: null,
                pendingSyncAt: null,
              },
      }),
      persistBoardSyncState,
    })

    const result = await pushAllLocalBoards('user-a', () => true, deps)

    expect(result).toEqual({
      status: 'completed',
      failedBoardIds: ['board-b'],
      permanentFailedBoardIds: ['board-c'],
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
    expect(persistBoardSyncState).toHaveBeenCalledWith('board-c', {
      lastSyncedRevision: 4,
      cloudBoardExternalId: 'cloud-c',
      pendingSyncAt: 456,
    })
  })

  it('marks pull completed even when only permanent push failures remain & on resumed pulls', async () =>
  {
    useWorkspaceBoardRegistryStore.setState({
      boards: [makeBoardMeta({ id: 'board-a' as BoardId, title: 'board-a' })],
      activeBoardId: null,
    })

    const markPermanentCompleted = vi.fn()
    await runFirstLoginBoardMerge(
      'user-a',
      () => true,
      createDeps({
        decideFirstLoginMerge: () => ({ action: 'push-local' }),
        markCloudPullCompleted: markPermanentCompleted,
        flushBoardToCloud: async () => ({
          kind: 'error',
          error: {
            kind: 'local-permanent',
            code: 'missing-local-image-blobs',
            permanent: true,
            cause: new Error('missing local blobs'),
          },
        }),
      })
    )
    expect(markPermanentCompleted).toHaveBeenCalledWith('user-a')

    resetRegistry()

    const markResumedCompleted = vi.fn()
    const markResumedPending = vi.fn()
    await runFirstLoginBoardMerge(
      'user-a',
      () => true,
      createDeps({
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
        markCloudPullCompleted: markResumedCompleted,
        markCloudPullPending: markResumedPending,
      })
    )
    expect(markResumedPending).toHaveBeenCalledWith('user-a')
    expect(markResumedCompleted).toHaveBeenCalledWith('user-a')
  })
})
