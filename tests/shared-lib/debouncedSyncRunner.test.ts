// tests/shared-lib/debouncedSyncRunner.test.ts
// shared debounced sync runner extension hooks

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDebouncedSyncRunner } from '~/shared/lib/sync/debouncedSyncRunner'
import { flushPromises } from './async'

describe('debounced sync runner', () =>
{
  beforeEach(() =>
  {
    vi.useFakeTimers()
  })

  afterEach(() =>
  {
    vi.useRealTimers()
  })

  it('defers a flush when beforeFlush returns a delay', async () =>
  {
    let locked = true
    const flush = vi.fn().mockResolvedValue({
      kind: 'synced' as const,
      success: 'ok',
    })
    const runner = createDebouncedSyncRunner<string, string, string>({
      debounceMs: 5,
      flush,
      beforeFlush: (work) =>
      {
        if (!locked) return { kind: 'proceed', work }
        locked = false
        return { kind: 'defer', delayMs: 20, work }
      },
    })

    runner.enqueue('settings', 'first')
    vi.advanceTimersByTime(5)
    await flushPromises()

    expect(flush).not.toHaveBeenCalled()

    vi.advanceTimersByTime(20)
    await flushPromises()

    expect(flush).toHaveBeenCalledWith('first', 'settings')
    await runner.dispose()
  })

  it('routes conflicts once without entering retry backoff', async () =>
  {
    const onConflict = vi.fn()
    const flush = vi.fn().mockResolvedValue({
      kind: 'conflict' as const,
      conflict: { revision: 2 },
    })
    const runner = createDebouncedSyncRunner<
      string,
      string,
      string,
      { revision: number }
    >({
      debounceMs: 5,
      flush,
      onConflict,
    })

    runner.enqueue('board-a', 'snapshot')
    vi.advanceTimersByTime(5)
    await flushPromises()
    vi.advanceTimersByTime(100)
    await flushPromises()

    expect(flush).toHaveBeenCalledTimes(1)
    expect(onConflict).toHaveBeenCalledWith(
      { revision: 2 },
      'snapshot',
      'board-a'
    )
    await runner.dispose()
  })

  it('drops queued work when prepareWork returns null', async () =>
  {
    const flush = vi.fn().mockResolvedValue({
      kind: 'synced' as const,
      success: 'ok',
    })
    const runner = createDebouncedSyncRunner<string, string, string>({
      debounceMs: 5,
      flush,
      prepareWork: () => null,
    })

    runner.enqueue('settings', 'first')
    vi.advanceTimersByTime(5)
    await flushPromises()

    expect(flush).not.toHaveBeenCalled()
    await runner.dispose()
  })
})
