// src/shared/hooks/useImageUrl.ts
// resolve image hash to a sync-readable object URL, w/ optional lazy cloud fetch

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import {
  getCachedImageUrl,
  subscribeCachedImageUrl,
  requestCloudImage,
} from '~/shared/images/imageBlobCache'
import { collectMissingCloudImageChainRequests } from '~/shared/images/imageUrlChainRequests'
import type { MediaVariantKind } from '@tierlistbuilder/contracts/platform/media'

interface ImageUrlSource
{
  hash: string | undefined
  cloudMediaExternalId?: string
  variant?: MediaVariantKind
}

interface StableImageUrlSource
{
  hash: string
  cloudMediaExternalId: string
  variant: MediaVariantKind
}

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

export const useImageUrlChain = (
  sources: readonly ImageUrlSource[]
): string | null =>
{
  // callers pass fresh `[primary, fallback]` literals every render, so a memo
  // keyed on the array reference never hits. derive a content key so subscribe
  // & getSnapshot only re-bind when the underlying hash chain actually changes
  const sourcesKey = sources
    .map((source) =>
      source.hash
        ? `${source.hash}:${source.cloudMediaExternalId ?? ''}:${source.variant ?? 'tile'}`
        : ''
    )
    .join('|')
  const stableSources = useMemo<StableImageUrlSource[]>(
    () =>
      sources
        .filter((source): source is ImageUrlSource & { hash: string } =>
          Boolean(source.hash)
        )
        .map((source) => ({
          hash: source.hash,
          cloudMediaExternalId: source.cloudMediaExternalId ?? '',
          variant: source.variant ?? 'tile',
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sourcesKey is the stable content hash; sources is recomputed each call
    [sourcesKey]
  )
  const subscribe = useCallback(
    (listener: () => void) =>
    {
      const unsubscribers = stableSources.map((source) =>
        subscribeCachedImageUrl(source.hash, listener)
      )
      return () =>
      {
        for (const unsubscribe of unsubscribers)
        {
          unsubscribe()
        }
      }
    },
    [stableSources]
  )
  const getSnapshot = useCallback(() =>
  {
    for (const source of stableSources)
    {
      const url = getCachedImageUrl(source.hash)
      if (url) return url
    }
    return null
  }, [stableSources])

  const url = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() =>
  {
    const requests = collectMissingCloudImageChainRequests(
      stableSources,
      getCachedImageUrl
    )
    for (const request of requests)
    {
      requestCloudImage(
        request.hash,
        request.cloudMediaExternalId,
        request.variant
      )
    }
  }, [stableSources, url])

  return url
}
