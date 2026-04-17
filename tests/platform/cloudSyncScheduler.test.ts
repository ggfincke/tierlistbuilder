import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import {
  createCloudSyncScheduler,
  type FlushResult,
  type PendingBoardSync,
} from '~/features/platform/sync/boards/cloudSyncScheduler'
import { createInitialBoardData } from '~/features/workspace/boards/model/boardSnapshot'

const flushPromises = async (): Promise<void> =>
{
  await Promise.resolve()
  await Promise.resolve()
}

const makeSnapshot = (title: string): BoardSnapshot => ({
  ...createInitialBoardData('classic'),
  title,
})

const makeWork = (boardId: BoardId, title: string): PendingBoardSync =>
{
  const snapshot = makeSnapshot(title)

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
    const persist = vi.fn()
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
      persist,
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
    // synced flush persists w/ revision advanced & dirty marker cleared.
    // (the earlier dirty-marker persist on queue() is also recorded — we
    // assert on the synced one specifically via toHaveBeenCalledWith)
    expect(persist).toHaveBeenCalledWith('board-a', {
      lastSyncedRevision: 2,
      cloudBoardExternalId: 'cloud-a',
      pendingSyncAt: null,
    })

    await scheduler.dispose()
  })

  it('dedupes the last uploaded board state but still syncs later edits', async () =>
  {
    const flush = vi.fn().mockResolvedValue(synced(3, 'cloud-a'))

    const scheduler = createCloudSyncScheduler({
      debounceMs: 5,
      hasBoard: () => true,
      flush,
      persist: vi.fn(),
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

    const scheduler = createCloudSyncScheduler({
      debounceMs: 5,
      hasBoard: () => true,
      flush,
      persist: vi.fn(),
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
    const persist = vi.fn()
    const onConflict = vi.fn()
    const serverState = {
      title: 'Cloud board',
      revision: 4,
      tiers: [],
      items: [],
    }

    const flush = vi
      .fn<(work: PendingBoardSync) => Promise<FlushResult>>()
      .mockResolvedValueOnce({ kind: 'conflict', serverState })

    const scheduler = createCloudSyncScheduler({
      debounceMs: 5,
      hasBoard: () => true,
      flush,
      persist,
      onConflict,
    })

    scheduler.queue(makeWork('board-a' as BoardId, 'First'))
    vi.advanceTimersByTime(5)
    await flushPromises()

    expect(flush).toHaveBeenCalledTimes(1)
    // queue() persists a dirty marker, but the conflict path must NOT
    // advance lastSyncedRevision — assert on the absence of any synced
    // persist instead of the absence of all persists
    expect(persist).not.toHaveBeenCalledWith(
      'board-a',
      expect.objectContaining({
        lastSyncedRevision: expect.any(Number),
      })
    )
    expect(onConflict).toHaveBeenCalledWith('board-a', serverState)

    await scheduler.dispose()
  })

  it('routes error results through onError without persisting', async () =>
  {
    const persist = vi.fn()
    const onError = vi.fn()
    const err = new Error('boom')

    const flush = vi
      .fn<(work: PendingBoardSync) => Promise<FlushResult>>()
      .mockResolvedValueOnce({ kind: 'error', error: err })
      .mockResolvedValueOnce(synced(9, 'cloud'))

    const scheduler = createCloudSyncScheduler({
      debounceMs: 5,
      hasBoard: () => true,
      flush,
      persist,
      onError,
    })

    scheduler.queue(makeWork('board-a' as BoardId, 'First'))
    vi.advanceTimersByTime(5)
    await flushPromises()

    expect(onError).toHaveBeenCalledWith('board-a', err)
    // queue() persists a dirty marker, but the error path must NOT advance
    // lastSyncedRevision
    expect(persist).not.toHaveBeenCalledWith(
      'board-a',
      expect.objectContaining({
        lastSyncedRevision: expect.any(Number),
      })
    )

    await scheduler.dispose()
  })

  it('retries a failed flush even when no newer edit arrives', async () =>
  {
    const persist = vi.fn()
    const onError = vi.fn()
    const flush = vi
      .fn<(work: PendingBoardSync) => Promise<FlushResult>>()
      .mockResolvedValueOnce({
        kind: 'error',
        error: new Error('temporary outage'),
      })
      .mockResolvedValueOnce(synced(7, 'cloud-a'))

    const scheduler = createCloudSyncScheduler({
      debounceMs: 5,
      hasBoard: () => true,
      flush,
      persist,
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
    expect(persist).toHaveBeenLastCalledWith('board-a', {
      lastSyncedRevision: 7,
      cloudBoardExternalId: 'cloud-a',
      pendingSyncAt: null,
    })

    await scheduler.dispose()
  })

  it('clears pendingSyncAt when queued work reverts to the last synced state', async () =>
  {
    const persist = vi.fn()
    const flush = vi.fn().mockResolvedValueOnce(synced(3, 'cloud-a'))

    const scheduler = createCloudSyncScheduler({
      debounceMs: 5,
      hasBoard: () => true,
      flush,
      persist,
    })

    const syncedWork = makeWork('board-a' as BoardId, 'Same')
    scheduler.queue(syncedWork)
    vi.advanceTimersByTime(5)
    await flushPromises()

    scheduler.queue({
      ...syncedWork,
      syncState: {
        lastSyncedRevision: 3,
        cloudBoardExternalId: 'cloud-a',
        pendingSyncAt: null,
      },
    })
    vi.advanceTimersByTime(5)
    await flushPromises()

    expect(flush).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenLastCalledWith('board-a', {
      lastSyncedRevision: 3,
      cloudBoardExternalId: 'cloud-a',
      pendingSyncAt: null,
    })

    await scheduler.dispose()
  })

  it('skips queued work when shouldProceed returns false (auth churn)', async () =>
  {
    const persist = vi.fn()
    const flush = vi.fn()
    let allow = true

    const scheduler = createCloudSyncScheduler({
      debounceMs: 5,
      hasBoard: () => true,
      shouldProceed: () => allow,
      flush,
      persist,
    })

    scheduler.queue(makeWork('board-a' as BoardId, 'First'))
    allow = false
    vi.advanceTimersByTime(5)
    await flushPromises()

    expect(flush).not.toHaveBeenCalled()
    // the dirty-marker persist on queue() runs unconditionally — it captures
    // local edits regardless of whether we'll get to push them. assert that
    // no synced persist (revision advancement) happened
    expect(persist).not.toHaveBeenCalledWith(
      'board-a',
      expect.objectContaining({
        lastSyncedRevision: expect.any(Number),
      })
    )

    await scheduler.dispose()
  })
})
