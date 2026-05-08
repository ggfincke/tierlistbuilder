// src/features/marketplace/model/usePointInTimeQuery.ts
// imperative snapshot-read hook w/ stale-result guard. callers memoize `args`;
// existing data stays visible across refetches so filter changes don't flash

import { useCallback, useEffect, useRef, useState } from 'react'

interface UsePointInTimeQueryOptions<TArgs, TData>
{
  args: TArgs
  query: (args: TArgs) => Promise<TData>
  onError?: (error: unknown) => void
}

interface PointInTimeQueryResult<TData>
{
  data: TData | undefined
  isRefreshing: boolean
  refresh: () => Promise<void>
}

export const usePointInTimeQuery = <TArgs, TData>({
  args,
  query,
  onError,
}: UsePointInTimeQueryOptions<TArgs, TData>): PointInTimeQueryResult<TData> =>
{
  const [data, setData] = useState<TData>()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const requestIdRef = useRef(0)
  const queryRef = useRef(query)
  const onErrorRef = useRef(onError)
  // sync the latest query/onError into refs after commit so concurrent renders
  // don't see torn state mid-render (refs aren't reactive — this is the
  // "always read latest" pattern, just without the render-time mutation)
  useEffect(() =>
  {
    queryRef.current = query
    onErrorRef.current = onError
  })

  const refresh = useCallback(async (): Promise<void> =>
  {
    const requestId = ++requestIdRef.current
    setIsRefreshing(true)

    try
    {
      const next = await queryRef.current(args)
      if (requestId !== requestIdRef.current) return
      setData(next)
    }
    catch (error)
    {
      if (requestId !== requestIdRef.current) return
      onErrorRef.current?.(error)
    }
    finally
    {
      if (requestId === requestIdRef.current)
      {
        setIsRefreshing(false)
      }
    }
  }, [args])

  useEffect(() =>
  {
    void refresh()
  }, [refresh])

  // bump request id on unmount so any in-flight resolve fails the guard &
  // skips setData/setError; setState-after-unmount is silently ignored in
  // React 18+ so no `mountedRef` is needed
  useEffect(
    () => () =>
    {
      requestIdRef.current += 1
    },
    []
  )

  return { data, isRefreshing, refresh }
}
