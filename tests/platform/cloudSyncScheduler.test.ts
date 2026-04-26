// tests/platform/cloudSyncScheduler.test.ts
// cloud sync scheduler queue behavior

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import {
  createCloudSyncScheduler,
  type FlushResult,
  type PendingBoardSync,
} from '~/features/workspace/boards/data/cloud/cloudSyncScheduler'
import { flushPromises } from '../shared-lib/async'
import { makeBoardSnapshot } from '../fixtures'

const makeWork = (boardId: BoardId, title: string): PendingBoardSync =>
{
  const snapshot = makeBoardSnapshot({ title })

  return {
    boardId,
    snapshot,
    boardDataSelection: [
      snapshot.title,
      snapshot.tiers,
      snapshot.unrankedItemIds,
      snapshot.items,
      snapshot.deletedItems,
    ],
    syncState: {
      lastSyncedRevision: null,
      cloudBoardExternalId: null,
      pendingSyncAt: null,
    },
  }
}

const makePersistPendingWork = () => vi.fn(() => true)

const synced = (revision: number, externalId: string): FlushResult => ({
  kind: 'synced',
  syncState: {
    lastSyncedRevision: revision,
    cloudBoardExternalId: externalId,
    pendingSyncAt: null,
  },
})

describe('cloud sync scheduler', () =>
{
  beforeEach(() =>
  {
    vi.useFakeTimers()
  })

  afterEach(() =>
  {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('retries queued work after an in-flight failure instead of dropping it', async () =>
  {
    const persistSyncState = vi.fn()
    const persistPendingWork = makePersistPendingWork()
    const persistSyncStateToStorage = vi.fn()
    let rejectFirstFlush: ((error?: unknown) => void) | null = null

    const flush = vi
      .fn<(work: PendingBoardSync) => Promise<FlushResult>>()
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) =>
          {
            rejectFirstFlush = reject
          })
      )
      .mockResolvedValueOnce(synced(2, 'cloud-a'))

    const scheduler = createCloudSyncScheduler({
      debounceMs: 10,
      hasBoard: () => true,
      flush,
      persistPendingWork,
      persistSyncState,
      persistSyncStateToStorage,
    })

    scheduler.queue(makeWork('board-a' as BoardId, 'First'))
    vi.advanceTimersByTime(10)
    await flushPromises()

    scheduler.queue(makeWork('board-a' as BoardId, 'Second'))
    rejectFirstFlush?.(new Error('upload failed'))
    await flushPromises()

    vi.advanceTimersByTime(10)
    await flushPromises()

    expect(flush).toHaveBeenCalledTimes(2)
    expect(flush.mock.calls[1][0].snapshot.title).toBe('Second')
    expect(persistSyncState).toHaveBeenCalledWith('board-a', {
      lastSyncedRevision: 2,
      cloudBoardExternalId: 'cloud-a',
      pendingSyncAt: null,
    })
    expect(persistPendingWork).toHaveBeenCalledWith(
      expect.objectContaining({
        boardId: 'board-a',
        snapshot: expect.objectContaining({ title: 'First' }),
      })
    )

    await scheduler.dispose()
  })

  it('dedupes the last uploaded board state but still syncs later edits', async () =>
  {
    const flush = vi.fn().mockResolvedValue(synced(3, 'cloud-a'))
    const persistPendingWork = makePersistPendingWork()

    const scheduler = createCloudSyncScheduler({
      debounceMs: 5,
      hasBoard: () => true,
      flush,
      persistPendingWork,
      persistSyncState: vi.fn(),
      persistSyncStateToStorage: vi.fn(),
    })

    const first = makeWork('board-a' as BoardId, 'Same')
    scheduler.queue(first)
    vi.advanceTimersByTime(5)
    await flushPromises()

    scheduler.queue(first)
    vi.advanceTimersByTime(5)
    await flushPromises()

    scheduler.queue(makeWork('board-a' as BoardId, 'Changed'))
    vi.advanceTimersByTime(5)
    await flushPromises()

    expect(flush).toHaveBeenCalledTimes(2)

    await scheduler.dispose()
  })

  it('keeps board queues isolated so each board flushes its own snapshot', async () =>
  {
    const flush = vi.fn().mockResolvedValue(synced(1, 'cloud'))
    const persistPendingWork = makePersistPendingWork()

    const scheduler = createCloudSyncScheduler({
      debounceMs: 5,
      hasBoard: () => true,
      flush,
      persistPendingWork,
      persistSyncState: vi.fn(),
      persistSyncStateToStorage: vi.fn(),
    })

    scheduler.queue(makeWork('board-a' as BoardId, 'Board A'))
    scheduler.queue(makeWork('board-b' as BoardId, 'Board B'))
    vi.advanceTimersByTime(5)
    await flushPromises()

    expect(
      flush.mock.calls.map(([work]) => [work.boardId, work.snapshot.title])
    ).toEqual([
      ['board-a', 'Board A'],
      ['board-b', 'Board B'],
    ])

    await scheduler.dispose()
  })

  it('does NOT advance persisted revision on a conflict result', async () =>
  {
    const persistSyncState = vi.fn()
    const persistPendingWork = makePersistPendingWork()
    const persistSyncStateToStorage = vi.fn()
    const onConflict = vi.fn()
    const serverState = {
      title: 'Cloud board',
      revision: 4,
      tiers: [],
      items: [],
    }

    const flush = vi
      .fn<(work: PendingBoardSync) => Promise<FlushResult>>()
      .mockResolvedValueOnce({
        kind: 'conflict',
        cloudBoardExternalId: 'cloud-a',
        serverState,
      })

    const scheduler = createCloudSyncScheduler({
      debounceMs: 5,
      hasBoard: () => true,
      flush,
      persistPendingWork,
      persistSyncState,
      persistSyncStateToStorage,
      onConflict,
    })

    scheduler.queue(makeWork('board-a' as BoardId, 'First'))
    vi.advanceTimersByTime(5)
    await flushPromises()

    expect(flush).toHaveBeenCalledTimes(1)
    // queue() persists a dirty marker, but the conflict path must NOT
    // advance lastSyncedRevision — assert on the absence of any synced
    // persist instead of the absence of all persists
    expect(persistSyncState).not.toHaveBeenCalledWith(
      'board-a',
      expect.objectContaining({
        lastSyncedRevision: expect.any(Number),
      })
    )
    expect(onConflict).toHaveBeenCalledWith('board-a', 'cloud-a', serverState)

    await scheduler.dispose()
  })

  it('routes error results through onError without persisting', async () =>
  {
    const persistSyncState = vi.fn()
    const persistPendingWork = makePersistPendingWork()
    const persistSyncStateToStorage = vi.fn()
    const onError = vi.fn()
    const err = {
      kind: 'unknown' as const,
      permanent: false as const,
      cause: new Error('boom'),
    }

    const flush = vi
      .fn<(work: PendingBoardSync) => Promise<FlushResult>>()
      .mockResolvedValueOnce({ kind: 'error', error: err })
      .mockResolvedValueOnce(synced(9, 'cloud'))

    const scheduler = createCloudSyncScheduler({
      debounceMs: 5,
      hasBoard: () => true,
      flush,
      persistPendingWork,
      persistSyncState,
      persistSyncStateToStorage,
      onError,
    })

    scheduler.queue(makeWork('board-a' as BoardId, 'First'))
    vi.advanceTimersByTime(5)
    await flushPromises()

    expect(onError).toHaveBeenCalledWith('board-a', err)
    // queue() persists a dirty marker, but the error path must NOT advance
    // lastSyncedRevision
    expect(persistSyncState).not.toHaveBeenCalledWith(
      'board-a',
      expect.objectContaining({
        lastSyncedRevision: expect.any(Number),
      })
    )

    await scheduler.dispose()
  })

  it('retries a failed flush even when no newer edit arrives', async () =>
  {
    const persistSyncState = vi.fn()
    const persistPendingWork = makePersistPendingWork()
    const persistSyncStateToStorage = vi.fn()
    const onError = vi.fn()
    const flush = vi
      .fn<(work: PendingBoardSync) => Promise<FlushResult>>()
      .mockResolvedValueOnce({
        kind: 'error',
        error: {
          kind: 'unknown',
          permanent: false,
          cause: new Error('temporary outage'),
        },
      })
      .mockResolvedValueOnce(synced(7, 'cloud-a'))

    const scheduler = createCloudSyncScheduler({
      debounceMs: 5,
      hasBoard: () => true,
      flush,
      persistPendingWork,
      persistSyncState,
      persistSyncStateToStorage,
      onError,
    })

    scheduler.queue(makeWork('board-a' as BoardId, 'First'))
    vi.advanceTimersByTime(5)
    await flushPromises()

    expect(flush).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(5)
    await flushPromises()

    expect(flush).toHaveBeenCalledTimes(2)
    expect(flush.mock.calls[1][0].snapshot.title).toBe('First')
    expect(persistSyncState).toHaveBeenLastCalledWith('board-a', {
      lastSyncedRevision: 7,
      cloudBoardExternalId: 'cloud-a',
      pendingSyncAt: null,
    })

    await scheduler.dispose()
  })

  it('skips queued work when shouldProceed returns false (auth churn)', async () =>
  {
    const persistSyncState = vi.fn()
    const persistPendingWork = makePersistPendingWork()
    const persistSyncStateToStorage = vi.fn()
    const flush = vi.fn()
    let allow = true

    const scheduler = createCloudSyncScheduler({
      debounceMs: 5,
      hasBoard: () => true,
      shouldProceed: () => allow,
      flush,
      persistPendingWork,
      persistSyncState,
      persistSyncStateToStorage,
    })

    scheduler.queue(makeWork('board-a' as BoardId, 'First'))
    allow = false
    vi.advanceTimersByTime(5)
    await flushPromises()

    expect(flush).not.toHaveBeenCalled()
    // the dirty-marker persist on queue() runs unconditionally — it captures
    // local edits regardless of whether we'll get to push them. assert that
    // no synced persist (revision advancement) happened
    expect(persistSyncState).not.toHaveBeenCalledWith(
      'board-a',
      expect.objectContaining({
        lastSyncedRevision: expect.any(Number),
      })
    )

    await scheduler.dispose()
  })

  it('clears persisted pendingSyncAt on permanent errors', async () =>
  {
    const persistSyncState = vi.fn()
    const persistPendingWork = makePersistPendingWork()
    const persistSyncStateToStorage = vi.fn()
    const onError = vi.fn()
    const flush = vi.fn().mockResolvedValueOnce({
      kind: 'error',
      error: {
        kind: 'convex',
        code: CONVEX_ERROR_CODES.forbidden,
        permanent: true,
        retryAfter: null,
        cause: new Error('forbidden'),
      },
    })

    const scheduler = createCloudSyncScheduler({
      debounceMs: 5,
      hasBoard: () => true,
      flush,
      persistPendingWork,
      persistSyncState,
      persistSyncStateToStorage,
      onError,
    })

    scheduler.queue({
      ...makeWork('board-a' as BoardId, 'First'),
      syncState: {
        lastSyncedRevision: 4,
        cloudBoardExternalId: 'cloud-a',
        pendingSyncAt: 123,
      },
    })
    vi.advanceTimersByTime(5)
    await flushPromises()

    expect(onError).toHaveBeenCalledTimes(1)
    expect(persistSyncState).toHaveBeenCalledWith('board-a', {
      lastSyncedRevision: 4,
      cloudBoardExternalId: 'cloud-a',
      pendingSyncAt: null,
    })

    vi.advanceTimersByTime(50)
    await flushPromises()

    expect(flush).toHaveBeenCalledTimes(1)

    await scheduler.dispose()
  })

  it('honors rate-limit retryAfter before retrying or flushing newer edits', async () =>
  {
    const persistSyncState = vi.fn()
    const persistPendingWork = makePersistPendingWork()
    const persistSyncStateToStorage = vi.fn()
    const onError = vi.fn()
    const flush = vi
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

    const scheduler = createCloudSyncScheduler({
      debounceMs: 5,
      hasBoard: () => true,
      flush,
      persistPendingWork,
      persistSyncState,
      persistSyncStateToStorage,
      onError,
    })

    scheduler.queue(makeWork('board-a' as BoardId, 'First'))
    vi.advanceTimersByTime(5)
    await flushPromises()

    scheduler.queue(makeWork('board-a' as BoardId, 'Second'))
    vi.advanceTimersByTime(39)
    await flushPromises()

    expect(flush).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    await flushPromises()

    expect(flush).toHaveBeenCalledTimes(2)
    expect(flush.mock.calls[1][0].snapshot.title).toBe('Second')
    expect(persistSyncState).toHaveBeenLastCalledWith('board-a', {
      lastSyncedRevision: 8,
      cloudBoardExternalId: 'cloud-a',
      pendingSyncAt: null,
    })

    await scheduler.dispose()
  })
})
