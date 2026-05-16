// convex/lib/cache.ts
// small per-function promise memoization helper

export const memoizePromise = <TKey, TValue>(
  map: Map<TKey, Promise<TValue>>,
  key: TKey,
  factory: () => Promise<TValue>
): Promise<TValue> =>
{
  const cached = map.get(key)
  if (cached) return cached

  const pending = factory()
  map.set(key, pending)
  return pending
}
