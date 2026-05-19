// convex/lib/cache.ts
// per-function promise memoization. scope `map` to one mutation/query —
// reusing across invocations leaks promises & captured `ctx` closures
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
