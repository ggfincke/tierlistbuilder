// src/shared/hooks/useAsyncAction.ts
// guarded async action state for command-style hooks

import { useCallback, useRef, useState } from 'react'

interface UseAsyncActionOptions
{
  onError?: (error: unknown) => void
  getErrorMessage?: (error: unknown) => string
}

interface AsyncActionState<TArgs extends readonly unknown[], TResult>
{
  run: (...args: TArgs) => Promise<TResult | null>
  isPending: boolean
  error: string | null
  setError: (message: string | null) => void
  clearError: () => void
}

export const useAsyncAction = <TArgs extends readonly unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
  options: UseAsyncActionOptions = {}
): AsyncActionState<TArgs, TResult> =>
{
  const { onError, getErrorMessage } = options
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingRef = useRef(false)

  const clearError = useCallback(() =>
  {
    setError(null)
  }, [])

  const run = useCallback(
    async (...args: TArgs): Promise<TResult | null> =>
    {
      if (pendingRef.current) return null

      pendingRef.current = true
      setIsPending(true)
      setError(null)
      try
      {
        return await action(...args)
      }
      catch (caught)
      {
        onError?.(caught)
        const message = getErrorMessage?.(caught) ?? null
        setError(message)
        return null
      }
      finally
      {
        pendingRef.current = false
        setIsPending(false)
      }
    },
    [action, getErrorMessage, onError]
  )

  return { run, isPending, error, setError, clearError }
}
