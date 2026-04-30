// src/shared/lib/sync/debouncedSyncRunner.ts
// generic debounced sync runner shared by workspace cloud adapters

import { computeBackoffDelay } from './backoff'
import { makeProceedGuard } from './proceedGuard'

export type SyncFlushResult<TSuccess, TConflict = never> =
  | { kind: 'synced'; success: TSuccess }
  | { kind: 'conflict'; conflict: TConflict }
  | { kind: 'error'; error: unknown }

export type BeforeSyncFlushDecision<TWork> =
  | { kind: 'proceed'; work?: TWork }
  | { kind: 'defer'; delayMs: number; work?: TWork }
  | { kind: 'drop' }

export interface SyncRunnerWorkContext<TWork>
{
  queuedWork: TWork | null
}

export interface SyncRunnerErrorContext<
  TWork,
> extends SyncRunnerWorkContext<TWork>
{
  retryAttempt: number
}

export interface DebouncedSyncRunnerDisposeOptions
{
  flush?: boolean
}

export interface DebouncedSyncRunnerOptions<TKey, TWork, TSuccess, TConflict>
{
  debounceMs: number
  flush: (
    work: TWork,
    key: TKey
  ) => Promise<SyncFlushResult<TSuccess, TConflict>>
  prepareWork?: (work: TWork, key: TKey) => TWork | null
  beforeFlush?: (work: TWork, key: TKey) => BeforeSyncFlushDecision<TWork>
  onQueue?: (work: TWork, key: TKey) => void
  onFlushStart?: (work: TWork, key: TKey) => void
  onSuccess?: (
    success: TSuccess,
    work: TWork,
    key: TKey,
    context: SyncRunnerWorkContext<TWork>
  ) => void
  rebaseQueuedOnSuccess?: (
    queuedWork: TWork,
    success: TSuccess,
    flushedWork: TWork,
    key: TKey
  ) => TWork | null
  onDedup?: (work: TWork, key: TKey) => void
  onConflict?: (conflict: TConflict, work: TWork, key: TKey) => void
  onError?: (
    error: unknown,
    key: TKey,
    work: TWork,
    context: SyncRunnerErrorContext<TWork>
  ) => void
  shouldRetryError?: (
    error: unknown,
    key: TKey,
    work: TWork,
    context: SyncRunnerErrorContext<TWork>
  ) => boolean
  getRetryDelayMs?: (
    error: unknown,
    key: TKey,
    work: TWork,
    context: SyncRunnerErrorContext<TWork>
  ) => number | null
  onDrop?: (work: TWork, key: TKey) => void
  shouldProceed?: () => boolean
  dedupEqual?: (a: TWork, b: TWork) => boolean
  dropQueuedOnUnretryableError?: boolean
  flushQueuedAfterSuccess?: 'debounce' | 'immediate'
  retainLastFlushed?: boolean
}

export interface TriggerOptions
{
  immediate?: boolean
}

export interface DebouncedSyncRunner<TKey, TWork>
{
  enqueue: (key: TKey, work: TWork, options?: TriggerOptions) => void
  dispose: (options?: DebouncedSyncRunnerDisposeOptions) => Promise<void>
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

export const createDebouncedSyncRunner = <
  TKey,
  TWork,
  TSuccess,
  TConflict = never,
>(
  options: DebouncedSyncRunnerOptions<TKey, TWork, TSuccess, TConflict>
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

  const isIdle = (c: Controller<TWork>): boolean =>
    c.timer === null &&
    c.queued === null &&
    c.inFlight === null &&
    (!options.retainLastFlushed || c.lastFlushed === null)

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
    options.onFlushStart?.(work, key)
    let shouldRetry = false
    let retryDelayMs: number | null = null
    let conflicted = false

    const handleError = (error: unknown): void =>
    {
      const context: SyncRunnerErrorContext<TWork> = {
        queuedWork: c.queued,
        retryAttempt: c.retryAttempt,
      }
      options.onError?.(error, key, work, context)
      shouldRetry = options.shouldRetryError
        ? options.shouldRetryError(error, key, work, context)
        : true

      retryDelayMs = shouldRetry
        ? (options.getRetryDelayMs?.(error, key, work, context) ?? null)
        : null

      if (!shouldRetry && options.dropQueuedOnUnretryableError)
      {
        c.queued = null
      }
    }

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
            const queuedWork = c.queued
            options.onSuccess?.(result.success, work, key, { queuedWork })

            if (queuedWork && options.rebaseQueuedOnSuccess)
            {
              c.queued = options.rebaseQueuedOnSuccess(
                queuedWork,
                result.success,
                work,
                key
              )
            }
            return
          }

          if (result.kind === 'conflict')
          {
            conflicted = true
            c.retryAttempt = 0
            options.onConflict?.(result.conflict, work, key)
            return
          }
          handleError(result.error)
        },
        (error) =>
        {
          if (disposed) return
          // flush is expected to return a result; throws route through
          // onError so backoff retries still fire on unexpected errors
          handleError(error)
        }
      )
      .finally(() =>
      {
        c.inFlight = null
        if (disposed) return

        if (shouldRetry)
        {
          // re-queue the failed work so backoff replays the same payload
          // rather than racing the next edit
          if (c.queued === null) c.queued = work
          const delay =
            retryDelayMs ??
            computeBackoffDelay(options.debounceMs, c.retryAttempt)
          c.retryAttempt++
          scheduleFlush(key, c, delay)
          return
        }

        if (conflicted)
        {
          pruneIfIdle(key, c)
          return
        }

        // synced — drain any edit that arrived during the flush
        if (c.queued && !c.timer)
        {
          if (options.flushQueuedAfterSuccess === 'immediate')
          {
            flushQueued(key)
            return
          }

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
    if (work === null)
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

    const decision = options.beforeFlush?.(work, key)
    if (decision?.kind === 'defer')
    {
      c.queued = decision.work ?? work
      scheduleFlush(key, c, decision.delayMs)
      return
    }
    if (decision?.kind === 'drop')
    {
      options.onDrop?.(work, key)
      pruneIfIdle(key, c)
      return
    }

    void runFlush(key, c, decision?.work ?? work)
  }

  return {
    enqueue: (key, work, triggerOptions) =>
    {
      if (disposed) return
      // gate the sidecar stamp on auth/online — an aborted session must
      // not leave dirty markers that the next user's resume helper picks up
      if (!canProceed()) return

      const preparedWork = options.prepareWork
        ? options.prepareWork(work, key)
        : work
      if (preparedWork === null) return

      options.onQueue?.(preparedWork, key)

      const c = getController(key)
      c.queued = preparedWork
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

    dispose: async ({
      flush = false,
    }: DebouncedSyncRunnerDisposeOptions = {}) =>
    {
      if (flush)
      {
        for (const [key, c] of controllers)
        {
          clearTimer(c)
          if (!c.inFlight && c.queued !== null)
          {
            flushQueued(key)
          }
        }

        while (inFlightPromises.size > 0)
        {
          await Promise.allSettled([...inFlightPromises])
        }
      }

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
