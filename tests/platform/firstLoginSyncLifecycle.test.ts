// tests/platform/firstLoginSyncLifecycle.test.ts
// first-login sync lifecycle orchestration

import { describe, expect, it } from 'vitest'
import { runFirstLoginSyncLifecycle } from '~/features/platform/sync/orchestration/firstLoginSyncLifecycle'
import { flushPromises } from '../shared-lib/async'

interface DeferredPromise<T>
{
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
}

const createDeferred = <T>(): DeferredPromise<T> =>
{
  let resolve!: DeferredPromise<T>['resolve']
  const promise = new Promise<T>((innerResolve) =>
  {
    resolve = innerResolve
  })
  return { promise, resolve }
}

describe('firstLoginSyncLifecycle', () =>
{
  it('re-enables board sync before preferences & presets settle', async () =>
  {
    const board = createDeferred<void>()
    const preferences = createDeferred<void>()
    const presets = createDeferred<void>()
    const events: string[] = []
    let lifecycleSettled = false

    const lifecycle = runFirstLoginSyncLifecycle({
      shouldProceed: () => true,
      runBoardMerge: async () =>
      {
        events.push('board:start')
        await board.promise
        events.push('board:done')
      },
      runPreferencesMerge: async () =>
      {
        events.push('preferences:start')
        await preferences.promise
        events.push('preferences:done')
      },
      runPresetMerge: async () =>
      {
        events.push('preset:start')
        await presets.promise
        events.push('preset:done')
      },
      onBoardMergeSettled: () =>
      {
        events.push('board:settled')
      },
      onPreferencesMergeSettled: () =>
      {
        events.push('preferences:settled')
      },
      onPresetMergeSettled: () =>
      {
        events.push('preset:settled')
      },
    }).then(() =>
    {
      lifecycleSettled = true
    })

    await flushPromises()
    expect(events).toEqual(['board:start'])

    board.resolve()
    await flushPromises()

    expect(events).toEqual([
      'board:start',
      'board:done',
      'board:settled',
      'preferences:start',
      'preset:start',
    ])
    expect(lifecycleSettled).toBe(false)

    preferences.resolve()
    await flushPromises()

    expect(events).toEqual([
      'board:start',
      'board:done',
      'board:settled',
      'preferences:start',
      'preset:start',
      'preferences:done',
      'preferences:settled',
    ])
    expect(lifecycleSettled).toBe(false)

    presets.resolve()
    await lifecycle

    expect(events).toEqual([
      'board:start',
      'board:done',
      'board:settled',
      'preferences:start',
      'preset:start',
      'preferences:done',
      'preferences:settled',
      'preset:done',
      'preset:settled',
    ])
    expect(lifecycleSettled).toBe(true)
  })

  it('does not start auxiliary merges after auth churn following board merge', async () =>
  {
    const board = createDeferred<void>()
    const events: string[] = []
    let shouldProceed = true

    const lifecycle = runFirstLoginSyncLifecycle({
      shouldProceed: () => shouldProceed,
      runBoardMerge: async () =>
      {
        events.push('board:start')
        await board.promise
        events.push('board:done')
      },
      runPreferencesMerge: async () =>
      {
        events.push('preferences:start')
      },
      runPresetMerge: async () =>
      {
        events.push('preset:start')
      },
      onBoardMergeSettled: () =>
      {
        events.push('board:settled')
      },
      onPreferencesMergeSettled: () =>
      {
        events.push('preferences:settled')
      },
      onPresetMergeSettled: () =>
      {
        events.push('preset:settled')
      },
    })

    await flushPromises()
    shouldProceed = false
    board.resolve()
    await lifecycle

    expect(events).toEqual(['board:start', 'board:done'])
  })
})
