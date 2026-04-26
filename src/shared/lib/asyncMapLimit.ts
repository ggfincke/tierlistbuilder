// src/shared/lib/asyncMapLimit.ts
// concurrency-limited async mapping helper that preserves input order

// map values w/ a bounded number of concurrent tasks. aborts (via rejection)
// on the first task failure — use mapAsyncLimitSettled when callers need
// to collect per-value failures instead
export const mapAsyncLimit = async <T, TResult>(
  values: readonly T[],
  limit: number,
  mapValue: (value: T, _index: number) => Promise<TResult>
): Promise<TResult[]> =>
{
  if (limit < 1)
  {
    throw new Error('Concurrency limit must be at least 1.')
  }

  if (values.length === 0)
  {
    return []
  }

  const results = new Array<TResult>(values.length)
  let nextIndex = 0

  const workerCount = Math.min(limit, values.length)
  const workers = Array.from({ length: workerCount }, async () =>
  {
    while (true)
    {
      const currentIndex = nextIndex
      nextIndex++

      if (currentIndex >= values.length)
      {
        return
      }

      results[currentIndex] = await mapValue(values[currentIndex], currentIndex)
    }
  })

  await Promise.all(workers)
  return results
}

// Promise.allSettled-style variant: every task runs to completion & each
// result is wrapped in a { status: 'fulfilled' | 'rejected' } record so the
// caller can aggregate partial failures without losing successes
export const mapAsyncLimitSettled = async <T, TResult>(
  values: readonly T[],
  limit: number,
  mapValue: (value: T, _index: number) => Promise<TResult>
): Promise<PromiseSettledResult<TResult>[]> =>
  mapAsyncLimit(values, limit, async (value, index) =>
  {
    try
    {
      return { status: 'fulfilled', value: await mapValue(value, index) }
    }
    catch (reason)
    {
      return { status: 'rejected', reason }
    }
  })
