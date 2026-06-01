// src/shared/lib/auto-crop/scanCache.ts
// small LRU cache factory for auto-crop scan results

import type { AutoCropScan } from '@tierlistbuilder/contracts/workspace/autoCrop'

import { setMapEntryLru, touchMapEntry } from '~/shared/lib/lru'

export const createScanCache = <TKey>(maxEntries: number) =>
{
  const entries = new Map<TKey, AutoCropScan | null>()

  return {
    remember(key: TKey, scan: AutoCropScan | null): void
    {
      setMapEntryLru(entries, key, scan, maxEntries)
    },
    read(key: TKey): AutoCropScan | null | undefined
    {
      if (!entries.has(key)) return undefined
      const scan = entries.get(key) ?? null
      touchMapEntry(entries, key)
      return scan
    },
  }
}
