// tests/platform/firstLoginSyncLifecycle.test.ts
// first-login sync lifecycle orchestration

import { describe, expect, it } from 'vitest'
import { runFirstLoginSyncLifecycle } from '~/features/platform/sync/orchestration/firstLoginSyncLifecycle'

interface DeferredPromise<T>
{
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
}

const flushPromises = async (): Promise<void> =>
{
  await Promise.resolve()
  await Promise.resolve()
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
  it('re-enables board sync before settings & presets settle', async () =>
  {
    const board = createDeferred<void>()
    const settings = createDeferred<void>()
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
      runSettingsMerge: async () =>
      {
        events.push('settings:start')
        await settings.promise
        events.push('settings:done')
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
      onSettingsMergeSettled: () =>
      {
        events.push('settings:settled')
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
      'settings:start',
      'preset:start',
    ])
    expect(lifecycleSettled).toBe(false)

    settings.resolve()
    await flushPromises()

    expect(events).toEqual([
      'board:start',
      'board:done',
      'board:settled',
      'settings:start',
      'preset:start',
      'settings:done',
      'settings:settled',
    ])
    expect(lifecycleSettled).toBe(false)

    presets.resolve()
    await lifecycle

    expect(events).toEqual([
      'board:start',
      'board:done',
      'board:settled',
      'settings:start',
      'preset:start',
      'settings:done',
      'settings:settled',
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
      runSettingsMerge: async () =>
      {
        events.push('settings:start')
      },
      runPresetMerge: async () =>
      {
        events.push('preset:start')
      },
      onBoardMergeSettled: () =>
      {
        events.push('board:settled')
      },
      onSettingsMergeSettled: () =>
      {
        events.push('settings:settled')
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
