// src/shared/lib/lru.ts
// insertion-order Map eviction helper for small in-memory LRU caches

export const pruneOldestMapEntries = <TKey, TValue>(
  map: Map<TKey, TValue>,
  maxSize: number,
  isProtected: (key: TKey, value: TValue) => boolean = () => false
): void =>
{
  if (map.size <= maxSize) return

  for (const [key, value] of map)
  {
    if (map.size <= maxSize) return
    if (isProtected(key, value)) continue
    map.delete(key)
  }
}
