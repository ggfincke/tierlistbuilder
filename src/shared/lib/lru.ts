// src/shared/lib/lru.ts
// insertion-order Map eviction helpers for small in-memory LRU caches

export const pruneOldestMapEntries = <TKey, TValue>(
  map: Map<TKey, TValue>,
  maxSize: number,
  isProtected: (key: TKey, value: TValue) => boolean = () => false,
  onPruned: (key: TKey, value: TValue) => void = () => undefined
): void =>
{
  if (map.size <= maxSize) return

  for (const [key, value] of map)
  {
    if (map.size <= maxSize) return
    if (isProtected(key, value)) continue
    map.delete(key)
    onPruned(key, value)
  }
}

// bump a key's recency in an insertion-order Map by re-inserting it.
// no-op if the key is absent. callers reading from an LRU cache invoke
// this to mark the entry as recently used so prune doesn't evict it
export const touchMapEntry = <TKey, TValue>(
  map: Map<TKey, TValue>,
  key: TKey
): void =>
{
  if (!map.has(key)) return
  const value = map.get(key) as TValue
  map.delete(key)
  map.set(key, value)
}

// write `value` as the most-recent entry & prune the oldest to keep the
// cache within `maxSize`. equivalent to the touch-then-set-then-prune
// pattern repeated across cache writers
export const setMapEntryLru = <TKey, TValue>(
  map: Map<TKey, TValue>,
  key: TKey,
  value: TValue,
  maxSize: number
): void =>
{
  map.delete(key)
  map.set(key, value)
  pruneOldestMapEntries(map, maxSize)
}
