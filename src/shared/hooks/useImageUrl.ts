// src/shared/hooks/useImageUrl.ts
// resolve image hash to a sync-readable object URL, w/ optional lazy cloud fetch

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import {
  getCachedImageUrl,
  subscribeCachedImageUrl,
  requestCloudImage,
} from '~/shared/images/imageBlobCache'
import type { MediaVariantKind } from '@tierlistbuilder/contracts/platform/media'

export const useImageUrl = (
  hash: string | undefined,
  cloudMediaExternalId?: string,
  variant: MediaVariantKind = 'tile'
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
    requestCloudImage(hash, cloudMediaExternalId, variant)
  }, [hash, cloudMediaExternalId, variant, url])

  return url
}

export const useFirstCachedImageUrl = (
  hashes: readonly (string | undefined)[]
): string | null =>
{
  const hashKey = hashes.filter(Boolean).join('\u001f')
  const stableHashes = useMemo(
    () => (hashKey ? hashKey.split('\u001f') : []),
    [hashKey]
  )
  const subscribe = useCallback(
    (listener: () => void) =>
    {
      const unsubscribers = stableHashes.map((hash) =>
        subscribeCachedImageUrl(hash, listener)
      )
      return () =>
      {
        for (const unsubscribe of unsubscribers)
        {
          unsubscribe()
        }
      }
    },
    [stableHashes]
  )
  const getSnapshot = useCallback(() =>
  {
    for (const hash of stableHashes)
    {
      const url = getCachedImageUrl(hash)
      if (url) return url
    }
    return null
  }, [stableHashes])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
