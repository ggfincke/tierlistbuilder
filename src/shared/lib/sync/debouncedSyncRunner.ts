// src/shared/lib/sync/debouncedSyncRunner.ts
// generic debounced sync runner shared by settings & tier-preset cloud runners

import { computeBackoffDelay } from './backoff'
import { makeProceedGuard } from './proceedGuard'

export type SyncFlushResult<TSuccess> =
  | { kind: 'synced'; success: TSuccess }
  | { kind: 'error'; error: unknown }

export interface DebouncedSyncRunnerOptions<TKey, TWork, TSuccess>
{
  debounceMs: number
  flush: (work: TWork, key: TKey) => Promise<SyncFlushResult<TSuccess>>
  onQueue?: (work: TWork, key: TKey) => void
  onSuccess?: (success: TSuccess, work: TWork, key: TKey) => void
  onDedup?: (work: TWork, key: TKey) => void
  onError?: (error: unknown, key: TKey) => void
  shouldProceed?: () => boolean
  dedupEqual?: (a: TWork, b: TWork) => boolean
}

export interface TriggerOptions
{
  immediate?: boolean
}

export interface DebouncedSyncRunner<TKey, TWork>
{
  enqueue: (key: TKey, work: TWork, options?: TriggerOptions) => void
  dispose: () => Promise<void>
}

interface Controller<TWork>
{
  timer: ReturnType<typeof setTimeout> | null
  queued: TWork | null
  inFlight: TWork | null
  lastFlushed: TWork | null
  retryAttempt: number
}

const createController = <TWork>(): Controller<TWork> => ({
  timer: null,
  queued: null,
  inFlight: null,
  lastFlushed: null,
  retryAttempt: 0,
})

export const createDebouncedSyncRunner = <TKey, TWork, TSuccess>(
  options: DebouncedSyncRunnerOptions<TKey, TWork, TSuccess>
): DebouncedSyncRunner<TKey, TWork> =>
{
  const canProceed = makeProceedGuard(options.shouldProceed)
  const controllers = new Map<TKey, Controller<TWork>>()
  const inFlightPromises = new Set<Promise<void>>()
  let disposed = false

  const getController = (key: TKey): Controller<TWork> =>
  {
    const existing = controllers.get(key)
    if (existing) return existing
    const created = createController<TWork>()
    controllers.set(key, created)
    return created
  }

  // idle once no live work remains. lastFlushed is cache & is intentionally
  // excluded — keeping it in the check would leak controllers forever
  const isIdle = (c: Controller<TWork>): boolean =>
    c.timer === null && c.queued === null && c.inFlight === null

  const pruneIfIdle = (key: TKey, c: Controller<TWork>): void =>
  {
    if (isIdle(c)) controllers.delete(key)
  }

  const clearTimer = (c: Controller<TWork>): void =>
  {
    if (c.timer !== null)
    {
      clearTimeout(c.timer)
      c.timer = null
    }
  }

  const scheduleFlush = (
    key: TKey,
    c: Controller<TWork>,
    delayMs: number = options.debounceMs
  ): void =>
  {
    clearTimer(c)
    c.timer = setTimeout(() =>
    {
      c.timer = null
      flushQueued(key)
    }, delayMs)
  }

  const runFlush = (
    key: TKey,
    c: Controller<TWork>,
    work: TWork
  ): Promise<void> =>
  {
    c.inFlight = work
    let errored = false

    const promise = options
      .flush(work, key)
      .then(
        (result) =>
        {
          if (disposed) return
          if (result.kind === 'synced')
          {
            c.retryAttempt = 0
            c.lastFlushed = work
            options.onSuccess?.(result.success, work, key)
            return
          }
          errored = true
          options.onError?.(result.error, key)
        },
        (error) =>
        {
          if (disposed) return
          // flush is expected to return a result; throws route through
          // onError so backoff retries still fire on unexpected errors
          errored = true
          options.onError?.(error, key)
        }
      )
      .finally(() =>
      {
        c.inFlight = null
        if (disposed) return

        if (errored)
        {
          // re-queue the failed work so backoff replays the same payload
          // rather than racing the next edit
          if (!c.queued) c.queued = work
          const delay = computeBackoffDelay(options.debounceMs, c.retryAttempt)
          c.retryAttempt++
          scheduleFlush(key, c, delay)
          return
        }

        // synced — drain any edit that arrived during the flush
        if (c.queued && !c.timer)
        {
          scheduleFlush(key, c)
          return
        }

        pruneIfIdle(key, c)
      })

    inFlightPromises.add(promise)
    void promise.finally(() => inFlightPromises.delete(promise))
    return promise
  }

  const flushQueued = (key: TKey): void =>
  {
    if (disposed) return

    if (!canProceed())
    {
      // auth churn — drop queued work so the previous user's edits don't
      // ride the next user's session
      const c = controllers.get(key)
      if (c)
      {
        c.queued = null
        clearTimer(c)
        pruneIfIdle(key, c)
      }
      return
    }

    const c = controllers.get(key)
    if (!c || c.inFlight) return

    const work = c.queued
    if (!work)
    {
      pruneIfIdle(key, c)
      return
    }

    c.queued = null

    if (c.lastFlushed && options.dedupEqual?.(c.lastFlushed, work))
    {
      // cloud already at work — skip the round trip & notify the caller
      // so the sidecar pending marker gets cleared
      c.retryAttempt = 0
      options.onDedup?.(work, key)
      pruneIfIdle(key, c)
      return
    }

    void runFlush(key, c, work)
  }

  return {
    enqueue: (key, work, triggerOptions) =>
    {
      if (disposed) return
      // gate the sidecar stamp on auth/online — an aborted session must
      // not leave dirty markers that the next user's resume helper picks up
      if (!canProceed()) return

      options.onQueue?.(work, key)

      const c = getController(key)
      c.queued = work
      // a fresh edit cancels pending backoff — the user's intent beats the
      // retry ladder. failures rebuild the progression from 0
      c.retryAttempt = 0

      if (triggerOptions?.immediate && !c.inFlight)
      {
        clearTimer(c)
        flushQueued(key)
        return
      }

      scheduleFlush(key, c)
    },

    dispose: async () =>
    {
      disposed = true

      for (const c of controllers.values())
      {
        clearTimer(c)
        c.queued = null
      }

      // wait for any in-flight flush to settle so the consumer gets a clean
      // tear-down. errors already routed via onError when they occurred.
      // queued work relies on sidecar recovery to replay next sign-in
      if (inFlightPromises.size > 0)
      {
        await Promise.allSettled([...inFlightPromises])
      }

      controllers.clear()
    },
  }
}
