import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import {
  createCloudSyncScheduler,
  type FlushResult,
  type PendingBoardSync,
} from '~/features/platform/sync/cloudSyncScheduler'
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
    },
  }
}

const synced = (revision: number, externalId: string): FlushResult => ({
  kind: 'synced',
  syncState: {
    lastSyncedRevision: revision,
    cloudBoardExternalId: externalId,
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
    expect(persist).toHaveBeenCalledWith('board-a', {
      lastSyncedRevision: 2,
      cloudBoardExternalId: 'cloud-a',
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

    const flush = vi
      .fn<(work: PendingBoardSync) => Promise<FlushResult>>()
      .mockResolvedValueOnce({ kind: 'conflict' })

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
    expect(persist).not.toHaveBeenCalled()
    expect(onConflict).toHaveBeenCalledWith('board-a')

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
    expect(persist).not.toHaveBeenCalled()

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
    expect(persist).not.toHaveBeenCalled()

    await scheduler.dispose()
  })
})
