// src/shared/lib/asyncMapLimit.ts
// concurrency-limited async mapping helper that preserves input order

// map values w/ a bounded number of concurrent tasks
export const mapAsyncLimit = async <T, TResult>(
  values: readonly T[],
  limit: number,
  mapValue: (value: T, index: number) => Promise<TResult>
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
