// src/shared/hooks/usePerKeyAsyncAction.ts
// per-key async command runner w/ in-flight dedupe & pending-key state

import { useCallback, useRef, useState } from 'react'

interface PerKeyAsyncActionOptions<TKey>
{
  onError?: (error: unknown, key: TKey) => void
}

interface PerKeyAsyncActionState<TKey>
{
  run: <TResult>(
    key: TKey,
    action: () => Promise<TResult>
  ) => Promise<TResult | null>
  pendingKey: TKey | null
}

export const usePerKeyAsyncAction = <TKey>({
  onError,
}: PerKeyAsyncActionOptions<TKey> = {}): PerKeyAsyncActionState<TKey> =>
{
  const [pendingKey, setPendingKey] = useState<TKey | null>(null)
  const inflightRef = useRef<Set<TKey>>(new Set())

  const run = useCallback(
    async <TResult>(
      key: TKey,
      action: () => Promise<TResult>
    ): Promise<TResult | null> =>
    {
      if (inflightRef.current.has(key)) return null

      inflightRef.current.add(key)
      setPendingKey(key)

      try
      {
        return await action()
      }
      catch (error)
      {
        onError?.(error, key)
        return null
      }
      finally
      {
        inflightRef.current.delete(key)
        setPendingKey((current) => (Object.is(current, key) ? null : current))
      }
    },
    [onError]
  )

  return { run, pendingKey }
}
