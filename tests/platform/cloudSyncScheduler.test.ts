// tests/platform/cloudSyncScheduler.test.ts
// cloud sync scheduler queue, retry, dedupe, & error handling

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import {
  createCloudSyncScheduler,
  type FlushResult,
  type PendingBoardSync,
} from '~/features/workspace/boards/data/cloud/cloudSyncScheduler'
import { EMPTY_BOARD_SYNC_STATE } from '~/features/workspace/boards/model/sync'
import { flushPromises } from '../shared-lib/async'
import { makeBoardSnapshot } from '../fixtures'

const makeWork = (boardId: BoardId, title: string): PendingBoardSync =>
{
  const snapshot = makeBoardSnapshot({ title })
  return {
    boardId,
    snapshot,
    syncState: EMPTY_BOARD_SYNC_STATE,
  }
}

const synced = (revision: number, externalId: string): FlushResult => ({
  kind: 'synced',
  syncState: {
    lastSyncedRevision: revision,
    cloudBoardExternalId: externalId,
    pendingSyncAt: null,
    pendingSyncOwnerUserId: null,
  },
})

const noOpDeps = () => ({
  persistPendingWork: vi.fn(() => true),
  persistSyncState: vi.fn(),
  persistSyncStateToStorage: vi.fn(),
})

describe('cloud sync scheduler', () =>
{
  beforeEach(() => vi.useFakeTimers())
  afterEach(() =>
  {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('retries failed flushes even when no newer edit arrives & queues newer edits while retrying', async () =>
  {
    const deps = noOpDeps()
    let rejectFirst: (err?: unknown) => void = () => {}
    const flush = vi
      .fn<(work: PendingBoardSync) => Promise<FlushResult>>()
      .mockImplementationOnce(
        () => new Promise((_, reject) => (rejectFirst = reject))
      )
      .mockResolvedValueOnce(synced(2, 'cloud-a'))

    const scheduler = createCloudSyncScheduler({
      ownerUserId: 'user-a',
      debounceMs: 10,
      hasBoard: () => true,
      flush,
      ...deps,
    })

    scheduler.queue(makeWork('board-a' as BoardId, 'First'))
    vi.advanceTimersByTime(10)
    await flushPromises()

    scheduler.queue(makeWork('board-a' as BoardId, 'Second'))
    rejectFirst(new Error('upload failed'))
    await flushPromises()
    vi.advanceTimersByTime(10)
    await flushPromises()

    expect(flush).toHaveBeenCalledTimes(2)
    expect(flush.mock.calls[1][0].snapshot.title).toBe('Second')
    expect(deps.persistSyncState).toHaveBeenCalledWith('board-a', {
      lastSyncedRevision: 2,
      cloudBoardExternalId: 'cloud-a',
      pendingSyncAt: null,
      pendingSyncOwnerUserId: null,
    })

    await scheduler.dispose()
  })

  it('persists pending markers with the current auth owner before flushing', async () =>
  {
    vi.setSystemTime(1_000)
    const deps = noOpDeps()
    const flush = vi.fn().mockResolvedValue(synced(1, 'cloud-a'))
    const scheduler = createCloudSyncScheduler({
      ownerUserId: 'user-a',
      debounceMs: 10,
      hasBoard: () => true,
      flush,
      ...deps,
    })

    scheduler.queue(makeWork('board-a' as BoardId, 'Fresh edit'))
    expect(deps.persistPendingWork).toHaveBeenCalledWith(
      expect.objectContaining({
        boardId: 'board-a',
        syncState: expect.objectContaining({
          pendingSyncAt: 1_000,
          pendingSyncOwnerUserId: 'user-a',
        }),
      })
    )

    vi.setSystemTime(2_000)
    scheduler.queue({
      ...makeWork('board-b' as BoardId, 'Fresh edit after user switch'),
      syncState: {
        lastSyncedRevision: 2,
        cloudBoardExternalId: 'cloud-b',
        pendingSyncAt: 500,
        pendingSyncOwnerUserId: 'user-b',
      },
    })
    expect(deps.persistPendingWork).toHaveBeenLastCalledWith(
      expect.objectContaining({
        boardId: 'board-b',
        syncState: expect.objectContaining({
          lastSyncedRevision: 2,
          cloudBoardExternalId: 'cloud-b',
          pendingSyncAt: 2_000,
          pendingSyncOwnerUserId: 'user-a',
        }),
      })
    )

    await scheduler.dispose()
  })

  it('does NOT advance revision on conflict, error, or auth-denied paths', async () =>
  {
    const deps = noOpDeps()
    const onConflict = vi.fn()
    const onError = vi.fn()
    const serverState = { title: 'Cloud', revision: 4, tiers: [], items: [] }
    const flush = vi
      .fn<(work: PendingBoardSync) => Promise<FlushResult>>()
      .mockResolvedValueOnce({
        kind: 'conflict',
        cloudBoardExternalId: 'cloud-a',
        serverState,
      })
      .mockResolvedValueOnce({
        kind: 'error',
        error: {
          kind: 'unknown',
          permanent: false,
          cause: new Error('boom'),
        },
      })

    const scheduler = createCloudSyncScheduler({
      ownerUserId: 'user-a',
      debounceMs: 5,
      hasBoard: () => true,
      flush,
      onConflict,
      onError,
      ...deps,
    })

    scheduler.queue(makeWork('board-a' as BoardId, 'First'))
    vi.advanceTimersByTime(5)
    await flushPromises()

    expect(onConflict).toHaveBeenCalledWith('board-a', 'cloud-a', serverState)

    scheduler.queue(makeWork('board-b' as BoardId, 'Second'))
    vi.advanceTimersByTime(5)
    await flushPromises()

    expect(onError).toHaveBeenCalledWith('board-b', expect.any(Object))
    expect(deps.persistSyncState).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ lastSyncedRevision: expect.any(Number) })
    )

    await scheduler.dispose()
  })

  it('clears pendingSyncAt on permanent errors & honors rate-limit retryAfter', async () =>
  {
    const permDeps = noOpDeps()
    const onPermError = vi.fn()
    const permFlush = vi.fn().mockResolvedValueOnce({
      kind: 'error',
      error: {
        kind: 'convex',
        code: CONVEX_ERROR_CODES.forbidden,
        permanent: true,
        retryAfter: null,
        cause: new Error('forbidden'),
      },
    })

    const permScheduler = createCloudSyncScheduler({
      ownerUserId: 'user-a',
      debounceMs: 5,
      hasBoard: () => true,
      flush: permFlush,
      onError: onPermError,
      ...permDeps,
    })

    permScheduler.queue({
      ...makeWork('board-a' as BoardId, 'First'),
      syncState: {
        lastSyncedRevision: 4,
        cloudBoardExternalId: 'cloud-a',
        pendingSyncAt: 123,
        pendingSyncOwnerUserId: 'user-a',
      },
    })
    vi.advanceTimersByTime(5)
    await flushPromises()

    expect(onPermError).toHaveBeenCalledTimes(1)
    expect(permDeps.persistSyncState).toHaveBeenCalledWith('board-a', {
      lastSyncedRevision: 4,
      cloudBoardExternalId: 'cloud-a',
      pendingSyncAt: null,
      pendingSyncOwnerUserId: null,
    })
    await permScheduler.dispose()

    const rateDeps = noOpDeps()
    const rateFlush = vi
      .fn<(work: PendingBoardSync) => Promise<FlushResult>>()
      .mockResolvedValueOnce({
        kind: 'error',
        error: {
          kind: 'convex',
          code: CONVEX_ERROR_CODES.rateLimited,
          permanent: false,
          retryAfter: 40,
          cause: new Error('rate limited'),
        },
      })
      .mockResolvedValueOnce(synced(8, 'cloud-a'))

    const rateScheduler = createCloudSyncScheduler({
      ownerUserId: 'user-a',
      debounceMs: 5,
      hasBoard: () => true,
      flush: rateFlush,
      onError: vi.fn(),
      ...rateDeps,
    })

    rateScheduler.queue(makeWork('board-a' as BoardId, 'First'))
    vi.advanceTimersByTime(5)
    await flushPromises()

    rateScheduler.queue(makeWork('board-a' as BoardId, 'Second'))
    vi.advanceTimersByTime(39)
    await flushPromises()
    expect(rateFlush).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    await flushPromises()
    expect(rateFlush).toHaveBeenCalledTimes(2)
    expect(rateFlush.mock.calls[1][0].snapshot.title).toBe('Second')

    await rateScheduler.dispose()
  })
})
