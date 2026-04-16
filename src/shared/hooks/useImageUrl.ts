// src/shared/hooks/useImageUrl.ts
// resolve image hash to a sync-readable object URL, w/ optional lazy cloud fetch

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import {
  getCachedImageUrl,
  subscribeCachedImageUrl,
  requestCloudImage,
} from '~/shared/images/imageBlobCache'

export const useImageUrl = (
  hash: string | undefined,
  cloudMediaExternalId?: string
): string | null =>
{
  const subscribe = useCallback(
    (listener: () => void) => subscribeCachedImageUrl(hash, listener),
    [hash]
  )
  const getSnapshot = useCallback(() => getCachedImageUrl(hash), [hash])

  const url = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() =>
  {
    if (!hash || !cloudMediaExternalId || url) return
    requestCloudImage(hash, cloudMediaExternalId)
  }, [hash, cloudMediaExternalId, url])

  return url
}
