// tests/platform/showcaseSaveScheduler.test.ts
// profile-showcase save debounce regressions

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShowcaseSaveScheduler } from '~/features/platform/showcase/model/showcaseSaveScheduler'

describe('createShowcaseSaveScheduler', () =>
{
  beforeEach(() =>
  {
    vi.useFakeTimers()
  })

  afterEach(() =>
  {
    vi.useRealTimers()
  })

  it('flushes a pending debounced save exactly once', () =>
  {
    const save = vi.fn()
    const scheduler = createShowcaseSaveScheduler(save, 500)

    scheduler.schedule()
    vi.advanceTimersByTime(499)
    expect(save).not.toHaveBeenCalled()

    scheduler.flush()
    expect(save).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('cancels stale timers when a save is rescheduled', () =>
  {
    const save = vi.fn()
    const scheduler = createShowcaseSaveScheduler(save, 500)

    scheduler.schedule()
    vi.advanceTimersByTime(250)
    scheduler.schedule()
    vi.advanceTimersByTime(499)
    expect(save).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(save).toHaveBeenCalledTimes(1)
  })
})
