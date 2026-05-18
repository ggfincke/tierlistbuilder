// src/shared/lib/promise.ts
// small Promise helpers for UI waits & bounded async work.

type TimeoutOptions =
  | {
      mode: 'resolveNull'
      onTimeout?: () => void
    }
  | {
      mode: 'reject'
      message: string
      onTimeout?: () => void
    }

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  options: { mode: 'resolveNull'; onTimeout?: () => void }
): Promise<T | null>
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  options: { mode: 'reject'; message: string; onTimeout?: () => void }
): Promise<T>
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  options: TimeoutOptions
): Promise<T | null>
{
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  try
  {
    return await Promise.race([
      promise,
      new Promise<null>((resolve, reject) =>
      {
        timeoutId = setTimeout(() =>
        {
          options.onTimeout?.()
          if (options.mode === 'reject')
          {
            reject(new Error(options.message))
            return
          }
          resolve(null)
        }, timeoutMs)
      }),
    ])
  }
  finally
  {
    if (timeoutId !== null) clearTimeout(timeoutId)
  }
}

export const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) =>
  {
    signal?.throwIfAborted()
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    function cleanup(): void
    {
      if (timeoutId !== null) clearTimeout(timeoutId)
      signal?.removeEventListener('abort', handleAbort)
    }
    function handleAbort(): void
    {
      cleanup()
      reject(
        signal?.reason ?? new DOMException('Operation aborted.', 'AbortError')
      )
    }
    timeoutId = setTimeout(() =>
    {
      cleanup()
      resolve()
    }, ms)
    signal?.addEventListener('abort', handleAbort, { once: true })
  })

export const withAbortSignal = async <T>(
  promise: Promise<T>,
  signal?: AbortSignal
): Promise<T> =>
{
  if (!signal) return promise
  signal.throwIfAborted()

  let handleAbort: (() => void) | null = null
  try
  {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) =>
      {
        handleAbort = () =>
          reject(
            signal.reason ??
              new DOMException('Operation aborted.', 'AbortError')
          )
        signal.addEventListener('abort', handleAbort, { once: true })
      }),
    ])
  }
  finally
  {
    if (handleAbort) signal.removeEventListener('abort', handleAbort)
  }
}
