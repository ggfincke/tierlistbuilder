// src/shared/hooks/useImageUrl.ts
// resolve image hash to a sync-readable object URL

import { useCallback, useSyncExternalStore } from 'react'
import {
  getCachedImageUrl,
  subscribeCachedImageUrl,
} from '@/shared/images/imageBlobCache'

export const useImageUrl = (hash: string | undefined): string | null =>
{
  const subscribe = useCallback(
    (listener: () => void) => subscribeCachedImageUrl(hash, listener),
    [hash]
  )
  const getSnapshot = useCallback(() => getCachedImageUrl(hash), [hash])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
